require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

const app = express();
const port = process.env.PORT || 5000; // Use the PORT environment variable

// Use CORS
app.use(cors());

// Set up multer for file uploads
const upload = multer({ dest: '/tmp/' }); // Use /tmp/ directory for uploads

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

// Serve the HTML file on the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/query-image', upload.single('image'), async (req, res) => {
  const imagePath = req.file.path;
  const customQuery = req.body.customQuery || '';

  try {
    const model = await genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const inputPrompt = 
      `You will receive input images as invoices &
      you will have to answer questions based on the input image.
      Custom Query, if the query they ask reply like assistant, also answer in same language as ask: ${customQuery}`
    ;
    const imageParts = [fileToGenerativePart(imagePath, 'image/jpg')];

    const result = await model.generateContent([inputPrompt, ...imageParts]);
    const response = await result.response;
    const text = await response.text();

    // Clean up the uploaded file
    fs.unlinkSync(imagePath);

    res.json({ result: text });
  } catch (error) {
    console.error('Error querying the Gemini LLM model:', error);
    res.status(500).json({ error: 'Error querying the Gemini LLM model', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
