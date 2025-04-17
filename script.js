let video = document.getElementById('video');
let canvas = document.getElementById('canvas');
let context = canvas.getContext('2d');
let currentCamera = 0;
let stream;


async function startCamera() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoDevices = devices.filter(device => device.kind === 'videoinput');
  const constraints = {
    video: {
      deviceId: videoDevices[currentCamera % videoDevices.length].deviceId
    }
  };
  stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = stream;
}

document.getElementById('switchCamera').addEventListener('click', () => {
  currentCamera++;
  stream.getTracks().forEach(track => track.stop());
  startCamera();
});

async function capture(side) {
 
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  const cropX = 170;
  const cropY = 100;
  const cropWidth = 300;
  const cropHeight = 180;

  let imageData = context.getImageData(cropX, cropY, cropWidth, cropHeight);

  let tempCanvas = document.createElement('canvas');
  tempCanvas.width = cropWidth;
  tempCanvas.height = cropHeight;
  let tempCtx = tempCanvas.getContext('2d');
  tempCtx.putImageData(imageData, 0, 0);

  
  let base64Image = tempCanvas.toDataURL('image/jpeg');

  
  const response = await fetch('/process_image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: base64Image,
      side: side
    })
  });

  const result = await response.json();

  if (side === 'front' && result.status === 'front_processed') {
    document.getElementById('instruction').innerText = 'Step 2: Capture Back Side of Aadhaar Card';
    document.getElementById('captureBack').disabled = false;
    document.getElementById('captureFront').disabled = true;
  }

  if (side === 'back' && result.status === 'back_processed') {
    document.getElementById('instruction').innerText = '✅ Done! Aadhaar Info Extracted';
    displayResult(result.data);
  }
}

function displayResult(data) {
  const resultDiv = document.getElementById('result');
  resultDiv.innerHTML = "<h3>Extracted Aadhaar Data:</h3>";
  for (let key in data) {
    resultDiv.innerHTML += `<p><strong>${key}:</strong> ${data[key]}</p>`;
  }
}

startCamera();
