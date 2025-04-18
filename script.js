let video = document.getElementById('video');
let canvas = document.getElementById('canvas');
let ctx = canvas.getContext('2d');
let currentCamera = 0;
let instruction = document.getElementById('instruction');
let cameras = [];

navigator.mediaDevices.enumerateDevices().then(devices => {
  cameras = devices.filter(d => d.kind === 'videoinput');
  startCamera();
});

function startCamera() {
  if (cameras.length === 0) return alert("No camera found");
  navigator.mediaDevices.getUserMedia({ video: { deviceId: cameras[currentCamera].deviceId } })
    .then(stream => {
      video.srcObject = stream;
    });
}

document.getElementById('switchCamera').onclick = () => {
  currentCamera = (currentCamera + 1) % cameras.length;
  startCamera();
};

function capture(step) {
  // Dimensions for cropping inside overlay (10% margin)
  const cropX = canvas.width * 0.1;
  const cropY = canvas.height * 0.1;
  const cropW = canvas.width * 0.8;
  const cropH = canvas.height * 0.8;

  // Create temporary canvas for cropping
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = cropW;
  tempCanvas.height = cropH;
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  // Send cropped image
  let imageData = tempCanvas.toDataURL('image/jpeg');

  fetch('/process_image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageData, step: step })
  })
  .then(res => res.json())
  .then(data => {
    if (step === 'step1') {
      instruction.innerText = 'Step 2: Capture Aadhaar Number';
    } else if (step === 'step2') {
      instruction.innerText = 'Step 3: Capture Address';
    } else if (step === 'step3') {
      instruction.innerText = '✅ Aadhaar data captured!';
      document.getElementById('result').innerHTML = `<a href="/download">Download Extracted Data</a>`;
    }
  });
}

