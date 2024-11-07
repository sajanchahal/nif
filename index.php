<?php
// Enable error reporting
ini_set('display_errors', 1);
error_reporting(E_ALL);

$apiKey = '72f32e0e-6c19-4edd-a944-30da5f4eee6b';
$googleApiKey = 'AIzaSyBl_IIgoc6zc0Qobciwm7RM9N8KXe_lt0k';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $sourceType = $_POST['sourceType'] ?? 'direct';
    $fileName = $_POST['fileName'] ?? null;

    try {
        if ($sourceType === 'direct') {
            $url = $_POST['url'] ?? null;
            if (!$url || !$fileName) {
                throw new Exception("Invalid request body for direct link upload.");
            }
            $uploadResult = streamUploadFromUrl($url, $fileName, $apiKey);

        } elseif ($sourceType === 'googleDrive') {
            $driveLink = $_POST['driveLink'] ?? null;
            if (!$driveLink) {
                throw new Exception("Google Drive link not provided.");
            }
            $driveFileId = extractDriveFileId($driveLink);
            $uploadResult = streamUploadFromGoogleDrive($driveFileId, $googleApiKey, $apiKey);

        } else {
            throw new Exception("Invalid source type.");
        }

        $id = $uploadResult['id'];
        echo "https://download.directserver.workers.dev/".$id."/".$fileName;
        http_response_code(200);

    } catch (Exception $e) {
        echo json_encode(['error' => $e->getMessage()]);
        http_response_code(500);
    }
} else {
    echo <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Upload Large File to PixelDrain</title>
</head>
<body>
    <h1>Upload Large File to PixelDrain</h1>
    <form method="post" action="/netlify/functions/uploadFile.php">
        <label>Upload Type:</label><br>
        <input type="radio" id="direct" name="sourceType" value="direct" checked> Direct Link<br>
        <input type="radio" id="googleDrive" name="sourceType" value="googleDrive"> Google Drive Link<br><br>

        <div>
            <label for="url">File URL:</label>
            <input type="url" id="url" name="url"><br><br>
            <label for="fileName">File Name:</label>
            <input type="text" id="fileName" name="fileName"><br><br>
        </div>

        <button type="submit">Upload</button>
    </form>
</body>
</html>
HTML;
}

// Function to upload a file from a URL in chunks
function streamUploadFromUrl($url, $fileName, $apiKey) {
    $tempFilePath = tempnam(sys_get_temp_dir(), 'upload');

 $chunkSize = 100 * 1024 * 1024; // 100 MB chunks
 // 1 MB chunks
    $file = fopen($tempFilePath, 'w+');
    $stream = fopen($url, 'rb');
    if (!$stream) {
        throw new Exception("Unable to open URL stream.");
    }

    // Read in chunks and write to temp file
    while (!feof($stream)) {
        fwrite($file, fread($stream, $chunkSize));
    }

    fclose($stream);
    fclose($file);

    return uploadToPixelDrain($apiKey, $tempFilePath, $fileName);
}

// Function to upload a Google Drive file in chunks
function streamUploadFromGoogleDrive($fileId, $googleApiKey, $apiKey) {
    $url = "https://www.googleapis.com/drive/v3/files/$fileId?alt=media&key=$googleApiKey";
    $metadataUrl = "https://www.googleapis.com/drive/v3/files/$fileId?fields=name&key=$googleApiKey";

    // Fetch metadata for file name
    $metadataResponse = file_get_contents($metadataUrl);
    $metadata = json_decode($metadataResponse, true);
    if (!$metadata || !isset($metadata['name'])) {
        throw new Exception("Failed to retrieve file metadata.");
    }

    $fileName = $metadata['name'];
    return streamUploadFromUrl($url, $fileName, $apiKey);
}

// Helper to upload the temp file to PixelDrain
function uploadToPixelDrain($apiKey, $filePath, $fileName) {
    $url = 'https://pixeldrain.com/api/file';
    $headers = [
        "Authorization: Basic " . base64_encode(":" . $apiKey),
    ];

    // Initialize cURL for PixelDrain upload
    $curl = curl_init($url);
    curl_setopt($curl, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($curl, CURLOPT_POST, true);
    curl_setopt($curl, CURLOPT_POSTFIELDS, ['file' => curl_file_create($filePath, 'application/octet-stream', $fileName)]);

    // Execute the cURL request
    $response = curl_exec($curl);
    if (curl_errno($curl)) {
        throw new Exception("cURL Error: " . curl_error($curl));
    }
    curl_close($curl);

    // Clean up the temporary file
    unlink($filePath);

    return json_decode($response, true);
}

// Extract Google Drive file ID from a link
function extractDriveFileId($url) {
    preg_match('/[-\w]{25,}/', $url, $matches);
    return $matches[0] ?? null;
}
?>
