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

    - **Core Info**: product_name,manufacturer, brand,model/SKU, and price (in rupees, no symbols).
    - **Description**: Includes a detailed paragraph and points with key features, unique benefits, and ideal uses.
    - **Specifications**: Size, weight, color, materials, and compatibility etc..
    - **Usage & Care**: Instructions, safety info, and any setup steps etc..
    - **Audience & Use Cases**: Target users and ideal settings etc..
    - **Extras**: Certifications, warranty, options (e.g., colors), and SEO tags etc..
    ALso if more information available added that also like for amazon and flipkart.
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
     Add more information if available aboout the specific product from internet. 
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
app.post('/query-images', upload.array('images', 10), async (req, res) => {
  console.log("Received a request to create product catalog.");
  const images = req.files
  console.log(`Number of images received: ${images.length}`);
  const customQuery = req.body.customQuery || '';

  try {
    // Step 1: Extract data from all images
    console.log("Starting Step 1: Extract data from images...");
    const imageParts = images.map(file => fileToGenerativePart(file.path, 'image/jpg'));
    
    const inputPrompt = `
      Analyze the provided products images and generate a complete e-commerce listing suitable for platforms like Amazon or Flipkart with product_name. 
1. BASIC INFORMATION:
   - product_name (exact model)
   - Brand Name
   - manufacturer,
   - description,
   - stock (always 1),
   - Model/SKU Number
   - price (in rupees, numbers only)
   - category
   - sub-category

2. PRODUCT DESCRIPTION:
   - Main Product Overview (2-3 sentences)
   - Key Features (minimum 5 points)
   - Unique Selling Points (3 points)
   - Package Contents (list all items)

3. DETAILED SPECIFICATIONS:
   - Dimensions (L x W x H in cm)
   - Weight (in grams)
   - Color Options
   - Material Composition
   - Power Requirements (if applicable)
   - Connectivity Options (if applicable)
   - Compatible With
   - Country of Origin
   - Manufacturing Date Format
   - Shelf Life (if applicable)

4. USAGE INFORMATION:
   - Installation Steps
   - Operating Instructions
   - Maintenance Requirements
   - Safety Precautions
   - Recommended Usage
   - Not Recommended For

5. TARGET AUDIENCE:
   - Primary User Group
   - Age Range
   - Skill Level Required
   - Ideal Use Cases
   - Industry/Setting

6. ADDITIONAL DETAILS:
   - Warranty Period
   - Warranty Type
   - After-sales Service
   - Certifications
   - Quality Standards
   - Return Policy
   - Available Variants
   - Seasonal Availability (if applicable)

7. E-COMMERCE SPECIFIC:
   - SEO Keywords (minimum 10)
   - Search Tags
   - Product Highlights (5 points)
   - Common Use Cases
   - Competitor Alternative Models

8. COMPLIANCE & SAFETY:
   - Safety Certifications
   - Environmental Standards
   - Age Restrictions (if any)
   - Warning Labels
   - Disposal Instructions

    Create a thorough, organized catalog entry ready for upload. 
    Return the output as a plain JSON object in the following structure:
    Leave any attribute with unknown values as an empty string
    Do not add any additional characters or formatting such as markdown or code syntax. 
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
    "
    `;
    
    let response;
    try {
      // Try gemini-1.5-flash first
      console.log("Attempting to use gemini-1.5-flash...");
      const flashModel = await genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const flashResult = await flashModel.generateContent([inputPrompt, ...imageParts]);
      response = await flashResult.response;
    } catch (flashError) {
      // If flash fails, fallback to gemini-1.5-pro
      console.log("gemini-1.5-flash failed, falling back to gemini-1.5-pro...");
      const proModel = await genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
      const proResult = await proModel.generateContent([inputPrompt, ...imageParts]);
      response = await proResult.response;
    }
    const responseText = response.text().trim();
    // Clean the response text of any potential markdown or code block indicators
    const cleanedResponse = responseText.replace(/```json\s*|\s*```/g, '').trim();
    const enhancedData = JSON.parse(cleanedResponse);
    console.log("Enhanced data:", enhancedData);
    // Step 2: Search for additional data based on extracted information
    // console.log("Starting Step 2: Search for additional product data...");
    // const enhancedData = await searchAdditionalData(extractedData);

    // Clean up the uploaded files
    images.forEach(file => fs.unlinkSync(file.path));
    console.log("Temporary files cleaned up.");

    // Send the final structured catalog as JSON response
    res.json(enhancedData);

  } catch (error) {
    console.error('Error creating the product catalog:', error);
    res.status(500).json({ error: 'Error creating the product catalog', details: error.message });
  }
});


// Endpoint to handle catalog creation for a single image
app.post('/query-image', upload.single('image'), async (req, res) => {
  console.log("Received a request to create product catalog from a single image.");
  console.log("Number of images received: 1");
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
