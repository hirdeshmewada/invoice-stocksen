require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 5000; // Use the PORT environment variable

// Use CORS
app.use(cors());

// Set up multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Access your API key as an environment variable
if (!process.env.GOOGLE_API_KEY) {
  throw new Error('GOOGLE_API_KEY is not defined in the environment variables');
}
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// Converts local file information to a GoogleGenerativeAI.Part object
function fileToGenerativePart(path, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(path)).toString('base64'),
      mimeType,
    },
  };
}

app.post('/query-image', upload.single('image'), async (req, res) => {
  const imagePath = req.file.path;
  const customQuery = req.body.customQuery || '';

  try {
    const model = await genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const inputPrompt = `
    "Analyze the provided image and extract all possible product details. If you have knowledge about that product, use them for creating a detailed catalog entry. Return the output as a plain JSON object in the following structure:

   {
      \"product_metadata\": [
          {
              \"product_name\": \"\",
              \"brand\": \"\",
              \"category\": \"\",
              \"description\": \"\",
              \"product_id\": \"\",
              \"request_id\": \"\",
              \"model\": \"\",
              \"model_year\": \"\",
              \"UPC\": \"\",
              \"SKU\": \"\",
              \"source_product_id\": \"\",
              \"size\": \"\",
              \"weight\": \"\",
              \"length\": \"\",
              \"breadth\": \"\",
              \"height\": \"\",
              \"color\": \"\",
              \"color_name\": \"\",
              \"pattern\": \"\",
              \"material\": \"\",
              \"gender\": \"\",
              \"collar\": \"\",
              \"sleeve_length\": \"\",
              \"fit\": \"\",
              \"hemline\": \"\",
              \"neck\": \"\",
              \"key_features\": \"\",
              \"care_instructions\": \"\",
              \"water_resistant\": \"\",
              \"battery_life\": \"\",
              \"occasion\": \"\",
              \"season\": \"\",
              \"refurbished\": \"\",
              \"image_link\": \"\",
              \"image_name\": \"\",
              \"additional_image_links\": \"\",
              \"manufacturer_details\": \"\",
              \"country_of_origin\": \"\",
              \"batch_number\": \"\",
              \"manufacturing_date\": \"\",
              \"expiry_date\": \"\",
              \"regulatory_numbers\": \"\",
              \"additives_info\": \"\",
              \"allergen_information\": \"\",
              \"nutritional_info\": {
                  \"energy_kcal\": \"\",
                  \"carbohydrates_gm\": \"\",
                  \"protein_gm\": \"\",
                  \"sodium_mg\": \"\",
                  \"total_fat_gm\": \"\",
                  \"fat_saturated_gm\": \"\",
                  \"fat_trans_gm\": \"\"
              },
              \"product_benefits\": \"\",
              \"product_highlights\": \"\",
              \"consumer_care_email\": \"\",
              \"consumer_care_phone\": \"\",
              \"instructions\": \"\",
              \"usage_notes\": \"\",
              \"unique_selling_points\": \"\",
              \"customer_id\": \"\",
              \"ondc_domain\": \"\"
          }
      ]
   }

   Ensure every attribute is present in the structure, even if the value is unknown. Leave any attribute with unknown values as an empty string. Do not add any additional characters or formatting such as markdown or code syntax."
   Custom Query: ${customQuery}
`;

    const imageParts = [fileToGenerativePart(imagePath, 'image/jpg')];

    const result = await model.generateContent([inputPrompt, ...imageParts]);
    const response = await result.response;
    const text = await response.text();

    // Parse the response text to a JavaScript object
    const parsedResult = JSON.parse(text);

    // Clean up the uploaded file
    fs.unlinkSync(imagePath);

    // Return the parsed result as a proper JSON object (not a string)
    res.json({ result: parsedResult });
  } catch (error) {
    console.error('Error querying the Gemini LLM model:', error);
    res.status(500).json({ error: 'Error querying the Gemini LLM model', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
