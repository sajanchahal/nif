// netlify/functions/uploadFile.js
const axios = require('axios');
const FormData = require('form-data');

const API_KEY = '72f32e0e-6c19-4edd-a944-30da5f4eee6b'; // Your PixelDrain API Key
const GOOGLE_API_KEY = 'AIzaSyBl_IIgoc6zc0Qobciwm7RM9N8KXe_lt0k'; // Your Google API Key

exports.handler = async function(event, context) {
    if (event.httpMethod === 'POST') {
        const { sourceType, url, fileName, driveLink } = JSON.parse(event.body);
        let fileData;

        try {
            if (sourceType === 'direct') {
                if (!url || !fileName) {
                    return { statusCode: 400, body: JSON.stringify({ error: "Invalid request body for direct link upload." }) };
                }
                fileData = await streamUploadFromUrl(url, fileName);
            } else if (sourceType === 'googleDrive') {
                if (!driveLink) {
                    return { statusCode: 400, body: JSON.stringify({ error: "Google Drive link not provided." }) };
                }
                const fileId = extractDriveFileId(driveLink);
                fileData = await streamUploadFromGoogleDrive(fileId);
            } else {
                return { statusCode: 400, body: JSON.stringify({ error: "Invalid source type." }) };
            }

            const id = fileData.id;
            return {
                statusCode: 200,
                body: JSON.stringify({ url: `https://download.directserver.workers.dev/${id}/${fileName}` })
            };
        } catch (error) {
            return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
        }
    }
};

async function streamUploadFromUrl(url, fileName) {
    const response = await axios.get(url, { responseType: 'stream' });
    const form = new FormData();
    form.append('file', response.data, { filename: fileName });
    const result = await uploadToPixelDrain(form);
    return result;
}

async function streamUploadFromGoogleDrive(fileId) {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${GOOGLE_API_KEY}`;
    const response = await axios.get(url, { responseType: 'stream' });
    const fileName = await getFileNameFromDrive(fileId);
    const form = new FormData();
    form.append('file', response.data, { filename: fileName });
    const result = await uploadToPixelDrain(form);
    return result;
}

async function uploadToPixelDrain(form) {
    const url = 'https://pixeldrain.com/api/file';
    const headers = {
        ...form.getHeaders(),
        Authorization: `Basic ${Buffer.from(':' + API_KEY).toString('base64')}`,
    };

    const response = await axios.post(url, form, { headers });
    return response.data;
}

async function getFileNameFromDrive(fileId) {
    const metadataUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name&key=${GOOGLE_API_KEY}`;
    const response = await axios.get(metadataUrl);
    return response.data.name;
}

function extractDriveFileId(url) {
    const matches = url.match(/[-\w]{25,}/);
    return matches ? matches[0] : null;
}
