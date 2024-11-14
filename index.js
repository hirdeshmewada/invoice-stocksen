require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());

const upload = multer({ dest: "/tmp/" });

if (!process.env.GOOGLE_API_KEY) {
  throw new Error('GOOGLE_API_KEY is not defined in the environment variables');
}
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// Helper to convert a file to a Generative Part object
function fileToGenerativePart(path, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(path)).toString('base64'),
      mimeType,
    },
  };
}

// Function to extract data from the image
async function extractDataFromImage(imagePath) {
  console.log("Starting image data extraction...");
  const model = await genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const inputPrompt = `
   "Analyze the provided product image and generate a complete e-commerce listing suitable for platforms like Amazon or Flipkart with product_name. 
    Include essential details:

    - **Core Info**: product_name, brand, model/SKU, and price (in rupees, no symbols).
    - **Description**: Includes a detailed paragraph and points with key features, unique benefits, and ideal uses.
    - **Specifications**: Size, weight, color, materials, and compatibility.
    - **Usage & Care**: Instructions, safety info, and any setup steps.
    - **Audience & Use Cases**: Target users and ideal settings.
    - **Extras**: Certifications, warranty, options (e.g., colors), and SEO tags.

    Create a thorough, organized catalog entry ready for upload."
  `;

  const imageParts = [fileToGenerativePart(imagePath, 'image/jpg')];
  const result = await model.generateContent([inputPrompt, ...imageParts]);
  const response = await result.response;
  console.log("Image data extraction completed. Extracted data:", response.text());
  return response.text();
}

// Function to search for additional product details based on extracted data
async function searchAdditionalData(extractedData) {
  console.log("Searching for additional product details...");
  const inputPrompt = `
    "Use the following product information to enhance details: ${JSON.stringify(extractedData)}. 
    Search for relevant metadata such as model, brand, category, and other catalog information. 
    Return the output as a plain JSON object in the following structure:
    Leave any attribute with unknown values as an empty string. 
    {
      "result": {
        "product_metadata": [
          {
            // Add additional fields and information as needed
          }
        ]
      }
    }
    Do not add any additional characters or formatting such as markdown or code syntax.
  `;

  const model = await genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const result = await model.generateContent([inputPrompt]);
  const response = await result.response;
  console.log("Additional data search completed. Enhanced data:", response.text());

  let enhancedData = {};
  try {
    enhancedData = JSON.parse(response.text());
  } catch (error) {
    console.error('Error parsing enhanced data:', error);
    throw new Error('Failed to parse enhanced data');
  }
  return enhancedData;
}

// Endpoint to handle the catalog creation for multiple images
app.post('/query-images', upload.array('images', 5), async (req, res) => {
  console.log("Received a request to create product catalog from multiple images.");
  const images = req.files;

  try {
    // Step 1: Extract initial data from each image
    const extractedData = await Promise.all(images.map(file => extractDataFromImage(file.path)));

    // Step 2: Search for additional data based on the extracted information
    const enhancedData = await Promise.all(extractedData.map(data => searchAdditionalData(data)));

    // Clean up the uploaded files
    images.forEach(file => fs.unlinkSync(file.path));
    console.log("Temporary files cleaned up.");

    res.json(enhancedData);

  } catch (error) {
    console.error('Error creating the product catalog:', error);
    res.status(500).json({ error: 'Error creating the product catalog', details: error.message });
  }
});

// Endpoint to handle catalog creation for a single image
app.post('/query-image', upload.single('image'), async (req, res) => {
  console.log("Received a request to create product catalog from a single image.");
  const imagePath = req.file.path;

  try {
    // Step 1: Extract initial data from the image
    const extractedData = await extractDataFromImage(imagePath);

    // Step 2: Search for additional data based on the extracted information
    const enhancedData = await searchAdditionalData(extractedData);

    // Clean up the uploaded file
    fs.unlinkSync(imagePath);
    console.log("Temporary file cleaned up.");

    res.json(enhancedData);

  } catch (error) {
    console.error('Error creating the product catalog:', error);
    res.status(500).json({ error: 'Error creating the product catalog', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
