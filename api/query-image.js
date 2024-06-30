const multer = require('multer');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

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

module.exports = (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) {
      return res.status(500).json({ error: 'Error uploading the file' });
    }

    const imagePath = req.file.path;
    const customQuery = req.body.customQuery || '';

    try {
      const model = await genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const inputPrompt = `
        You will receive input images as invoices &
        you will have to answer questions based on the input image.
        Custom Query, if the query they ask reply like assistant, also answer in same language as ask: ${customQuery}
      `;
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
};
