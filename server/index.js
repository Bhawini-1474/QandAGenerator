import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { PDFExtract } from 'pdf.js-extract';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Helper function to split text into smaller chunks for summarization
const splitTextForSummarization = (text, chunkSize = 2000) => {
    const words = text.split(' ');
    const chunks = [];
    let currentChunk = [];

    words.forEach(word => {
        if (currentChunk.join(' ').length + word.length <= chunkSize) {
            currentChunk.push(word);
        } else {
            chunks.push(currentChunk.join(' '));
            currentChunk = [word];
        }
    });

    if (currentChunk.length > 0) {
        chunks.push(currentChunk.join(' '));
    }

    return chunks;
};

// Helper function to split text into chunks for question generation
const splitTextIntoChunks = (text, chunkSize = 1500) => {
    const words = text.split(' ');
    const chunks = [];
    let currentChunk = [];

    words.forEach(word => {
        if (currentChunk.join(' ').length + word.length <= chunkSize) {
            currentChunk.push(word);
        } else {
            chunks.push(currentChunk.join(' '));
            currentChunk = [word];
        }
    });

    if (currentChunk.length > 0) {
        chunks.push(currentChunk.join(' '));
    }

    return chunks;
};

// Helper function for exponential backoff
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Function to query the summarization model with backoff
const querySummarizationModel = async (text, retries = 3) => {
    try {
        const response = await axios.post(
            'https://api-inference.huggingface.co/models/facebook/bart-large-cnn',
            {
                inputs: text,
                parameters: {
                    max_length: 512,
                    min_length: 100,
                    do_sample: false
                }
            },
            { headers: { Authorization: `Bearer ${process.env.HUGGINGFACE_TOKEN}` } }
        );
        return response.data[0].summary_text;
    } catch (error) {
        if (retries > 0 && error.response && error.response.status === 429) {
            console.error('Rate limit reached. Retrying...');
            await delay(2000);
            return querySummarizationModel(text, retries - 1);
        } else {
            console.error('Error querying Summarization Model:', error.response ? error.response.data : error.message);
            throw error;
        }
    }
};

// Function to query the question generation model
const queryQGModel = async (text) => {
    try {
        const formattedText = `generate multiple questions: ${text}`;
        const response = await axios.post(
            `https://api-inference.huggingface.co/models/valhalla/t5-base-qg-hl`,
            { inputs: formattedText },
            { headers: { Authorization: `Bearer ${process.env.HUGGINGFACE_TOKEN}` } }
        );
        return response.data;
    } catch (error) {
        console.error('Error querying QG Model:', error.response ? error.response.data : error.message);
        throw error;
    }
};

// Function to query the question answering model
const queryQAModel = async (question, context) => {
    try {
        const response = await axios.post(
            'https://api-inference.huggingface.co/models/deepset/roberta-base-squad2',
            { question: question, context: context },
            { headers: { Authorization: `Bearer ${process.env.HUGGINGFACE_TOKEN}` } }
        );
        return response.data;
    } catch (error) {
        console.error('Error querying QA Model:', error.response ? error.response.data : error.message);
        throw error;
    }
};

app.post('/upload', upload.single('file'), async (req, res) => {
    console.log('Upload route hit');

    if (req.file) {
        const filePath = req.file.path;
        const fileExtension = path.extname(req.file.originalname).toLowerCase();

        if (fileExtension === '.pdf') {
            const pdfExtract = new PDFExtract();
            const options = {};

            // Extract text from the PDF
            pdfExtract.extract(filePath, options, async (err, data) => {
                if (err) {
                    console.error('Error processing the PDF:', err);
                    return res.status(500).send('Error processing the PDF.');
                }

                const extractedText = data.pages.map(page =>
                    page.content.map(item => item.str).join(' ')
                ).join('\n');

                if (!extractedText) {
                    return res.status(400).send('No text extracted from the PDF.');
                }

                try {
                    // Summarize extracted text if it's large
                    console.log('Summarizing extracted text...');
                    const textChunks = splitTextForSummarization(extractedText, 2000);
                    let summarizedText = '';

                    for (const chunk of textChunks) {
                        const summary = await querySummarizationModel(chunk);
                        summarizedText += summary + ' ';
                    }

                    console.log('Summarized Text:', summarizedText);

                    // Split summarized text into chunks for question generation
                    const qgChunks = splitTextIntoChunks(summarizedText, 1500);
                    const questions = [];
                    const answers = [];

                    for (const chunk of qgChunks) {
                        console.log('Querying QG Model with chunk:', chunk.slice(0, 500));
                        try {
                            const qgResponse = await queryQGModel(chunk);
                            console.log('Full qg model response:',qgResponse);
                            const generatedQuestions = qgResponse.map(q => q.generated_text);
                            questions.push(...generatedQuestions);

                            // Generate answers for each question concurrently
                            const answerPromises = generatedQuestions.map(async (question) => {
                                try {
                                    const answer = await queryQAModel(question, chunk);
                                    return { question, answer: answer.answer }; // Include the question and answer in the result
                                } catch (err) {
                                    console.error(`Error generating answer for question "${question}":`, err);
                                    return { question, answer: null }; // Handle errors
                                }
                            });
                            const generatedAnswers = await Promise.all(answerPromises);
                            answers.push(...generatedAnswers);
                        } catch (error) {
                            console.error('Error querying QG Model:', error);
                            return res.status(500).send('Error generating questions or answers.');
                        }
                    }

                    res.send({
                        message: 'Questions and answers generated successfully!',
                        questions: questions,
                        answers: answers
                    });

                    console.log('Generated Questions:', questions);
                    console.log('Generated Answers:', answers);

                } catch (error) {
                    console.error('Error generating questions or answers:', error);
                    res.status(500).send('Error generating questions or answers.');
                }
            });

        } else {
            res.status(400).send('Uploaded file is not a PDF.');
        }
    } else {
        res.status(400).send('No file uploaded.');
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
