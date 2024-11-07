const fetch = require('node-fetch');
const FormData = require('form-data');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const { sourceType, fileName, url, driveLink } = JSON.parse(event.body);
    
    let uploadResult;

    if (sourceType === 'direct') {
      if (!url || !fileName) throw new Error('Invalid request body for direct link upload.');
      uploadResult = await streamUploadFromUrl(url, fileName);

    } else if (sourceType === 'googleDrive') {
      if (!driveLink) throw new Error('Google Drive link not provided.');
      const driveFileId = extractDriveFileId(driveLink);
      uploadResult = await streamUploadFromGoogleDrive(driveFileId, fileName);

    } else {
      throw new Error('Invalid source type.');
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        downloadUrl: `https://download.directserver.workers.dev/${uploadResult.id}/${fileName}`
      }),
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'An unknown error occurred' }),
    };
  }
};

// Helper to upload file from URL
async function streamUploadFromUrl(url, fileName) {
  // Fetch the file from the URL
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch file: ${response.statusText}`);

  // Create form data for upload to PixelDrain
  const form = new FormData();
  form.append('file', response.body, fileName);

  // Upload to PixelDrain
  const uploadResponse = await fetch('https://pixeldrain.com/api/file', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`:${process.env.PIXELDRAIN_API_KEY}`).toString('base64')}`,
    },
    body: form,
  });

  const contentType = uploadResponse.headers.get("content-type");
  const rawResponse = await uploadResponse.text(); // Read as text to inspect if needed

  // Check if response is JSON and attempt to parse it
  if (contentType && contentType.includes("application/json")) {
    try {
      return JSON.parse(rawResponse);
    } catch (err) {
      throw new Error(`Error parsing JSON response from PixelDrain: ${err.message} - Raw response: ${rawResponse}`);
    }
  } else {
    throw new Error(`Unexpected response format from PixelDrain: ${rawResponse}`);
  }
}

// Function to extract Google Drive file ID
function extractDriveFileId(url) {
  const matches = url.match(/[-\w]{25,}/);
  return matches ? matches[0] : null;
}
