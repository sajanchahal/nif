const fetch = require('node-fetch');
const FormData = require('form-data');

const PIXELDRAIN_API_KEY = '72f32e0e-6c19-4edd-a944-30da5f4eee6b';
const GOOGLE_API_KEY = 'AIzaSyBl_IIgoc6zc0Qobciwm7RM9N8KXe_lt0k';

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 200,
            body: `
            <!DOCTYPE html>
            <html lang="en">
            <head><meta charset="UTF-8"><title>Upload File</title></head>
            <body><h1>Upload File to PixelDrain</h1></body>
            </html>
            `,
        };
    }

    const { sourceType, url, fileName, driveLink } = JSON.parse(event.body);

    try {
        let uploadResult;
        if (sourceType === 'direct') {
            uploadResult = await streamUploadFromUrl(url, fileName);
        } else if (sourceType === 'googleDrive') {
            const driveFileId = extractDriveFileId(driveLink);
            uploadResult = await streamUploadFromGoogleDrive(driveFileId);
        } else {
            throw new Error("Invalid source type.");
        }

        const downloadUrl = `https://download.directserver.workers.dev/${uploadResult.id}/${fileName}`;
        return { statusCode: 200, body: JSON.stringify({ downloadUrl }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

// Function to upload a file from a URL to PixelDrain
async function streamUploadFromUrl(url, fileName) {
    const response = await fetch(url);
    const fileBuffer = await response.buffer();

    const formData = new FormData();
    formData.append('file', fileBuffer, { filename: fileName });
    const res = await fetch('https://pixeldrain.com/api/file', {
        method: 'POST',
        headers: { Authorization: `Basic ${Buffer.from(`:${PIXELDRAIN_API_KEY}`).toString('base64')}` },
        body: formData,
    });

    return await res.json();
}

// Function to upload from Google Drive by file ID
async function streamUploadFromGoogleDrive(fileId) {
    const metadataUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name&key=${GOOGLE_API_KEY}`;
    const metadataResponse = await fetch(metadataUrl);
    const metadata = await metadataResponse.json();
    const fileName = metadata.name;

    const fileUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${GOOGLE_API_KEY}`;
    return await streamUploadFromUrl(fileUrl, fileName);
}

// Extract Google Drive file ID from a link
function extractDriveFileId(url) {
    const matches = url.match(/[-\w]{25,}/);
    return matches ? matches[0] : null;
}
