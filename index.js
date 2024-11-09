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

// 1. Extract data from the image
async function extractDataFromImage(imagePath) {
  console.log("Starting image data extraction...");
  const model = await genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const inputPrompt = `
   "Analyze the provided product image and generate a complete e-commerce listing suitable for platforms like Amazon or Flipkart. 
     use web search Include essential details,:

    - **Core Info**: Product_name, brand, model/SKU, and price (in rupees, no symbols).
    - **Description**: Key features, unique benefits, and ideal uses.
    - **Specifications**: Size, weight, color, materials, and compatibility.
    - **Usage & Care**: Instructions, safety info, and any setup steps.
    - **Audience & Use Cases**: Target users and ideal settings.
    - **Description **: Includes a details paragraph and points about product like e commerce.
    - **Extras**: Certifications, warranty, options (e.g., colors), and SEO tags.

Create a thorough, organized catalog entry ready for upload."
  `;

  const imageParts = [fileToGenerativePart(imagePath, 'image/jpg')];
  const result = await model.generateContent([inputPrompt, ...imageParts]);
  const response = await result.response;
  console.log("Image data extraction completed. Extracted data:", response.text());
  return response.text();
}

// 2. Search for additional details based on extracted data
async function searchAdditionalData(extractedData) {
  console.log("Searching for additional product details...");
  const inputPrompt = `
    "Use the following product information to enhance details: ${JSON.stringify(extractedData)}. Search for relevant metadata such as model, brand, category, and other catalog information. Return the output as a plain JSON object in the following structure:
    Leave any attribute with unknown values as an empty string. 
    {
     "result": {
       "product_metadata": [
           {
               
               // Add additional fields and informations as needed
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

  // Parsing enhanced data into a JSON format, this needs to return a valid object structure
  let enhancedData = {};
  try {
    enhancedData = JSON.parse(response.text());
  } catch (error) {
    console.error('Error parsing enhanced data:', error);
    throw new Error('Failed to parse enhanced data');
  }
  return enhancedData;
}


// Endpoint to handle the catalog creation
app.post('/query-image', upload.single('image'), async (req, res) => {
  console.log("Received a request to create product catalog.");
  const imagePath = req.file.path;
  const customQuery = req.body.customQuery || '';

  try {
    // Step 1: Extract initial data from the image
    console.log("Starting Step 1: Extract data from image...");
    const extractedData = await extractDataFromImage(imagePath);

    // Step 2: Search for additional data based on the extracted information
    console.log("Starting Step 2: Search for additional product data...");
    const enhancedData = await searchAdditionalData(extractedData);


    // Clean up the uploaded file
    fs.unlinkSync(imagePath);
    console.log("Temporary file cleaned up.");

    // Send the final structured catalog as JSON response
    res.json(enhancedData);
 
  } catch (error) {
    console.error('Error creating the product catalog:', error);
    res.status(500).json({ error: 'Error creating the product catalog', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
