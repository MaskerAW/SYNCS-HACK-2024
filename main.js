import './style.css';

import firebase from 'firebase/app';
import 'firebase/firestore';

import * as tf from '@tensorflow/tfjs';


import * as mpHands from '@mediapipe/hands';

let model;


// Load your custom model
async function loadModel() {
  model = await tf.loadLayersModel('hackathon_model_1.h5');
  console.log("Model loaded successfully");
}

// Initialize MediaPipe Hands
const hands = new mpHands.Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
});

hands.setOptions({
  maxNumHands: 2,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
});

hands.onResults(onResults);

// const camera = new Camera(webcamVideo, {
//   onFrame: async () => {
//     await hands.send({image: webcamVideo});
//   },
//   width: 640,
//   height: 480,
// });
// camera.start();

async function onResults(results) {
  if (results.multiHandLandmarks) {
    for (const landmarks of results.multiHandLandmarks) {
      // Prepare landmarks as input to your custom model
      const input = tf.tensor(landmarks).expandDims(0);

      // Get predictions from your model
      const prediction = await model.predict(input).data();
      
      // Handle prediction results
      console.log("Prediction:", prediction);
    }
  }
}

// Load the custom model
loadModel();


// async function detectHandGesture(frame) {
//   // Preprocess the frame if necessary
//   const input = tf.browser.fromPixels(frame).expandDims(0).toFloat().div(tf.scalar(255));
  
//   // Predict with the model
//   const prediction = await model.predict(input).data();

//   // Handle the prediction output
//   console.log("Prediction:", prediction);
//   // Add your logic to interpret the prediction result
// }

// function processVideoFrame() {
//   const canvas = document.createElement('canvas');
//   const context = canvas.getContext('2d');

//   canvas.width = webcamVideo.videoWidth;
//   canvas.height = webcamVideo.videoHeight;

//   function captureFrame() {
//     context.drawImage(webcamVideo, 0, 0, canvas.width, canvas.height);
//     const frame = context.getImageData(0, 0, canvas.width, canvas.height);
//     detectHandGesture(frame); // Pass the frame to your detection function

//     requestAnimationFrame(captureFrame); // Continue capturing frames
//   }

//   captureFrame(); // Start the frame capture loop
// }


const firebaseConfig = {
  // your config
  apiKey: "AIzaSyDI5Bg9hpzwZ-PMPenweXwkOu0zRWuhqmw",
  authDomain: "syncs-zoom-call.firebaseapp.com",
  projectId: "syncs-zoom-call",
  storageBucket: "syncs-zoom-call.appspot.com",
  messagingSenderId: "409464140893",
  appId: "1:409464140893:web:50a98e7ebed5fc0503c9b4",
  measurementId: "G-DXFF7PMMJG"
};
// mkcert 10.19.81.201 localhost 127.0.0.1 ::1
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const firestore = firebase.firestore();

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Global State
const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

// HTML elements
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');

// 1. Setup media sources

webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  remoteStream = new MediaStream();

  // Push tracks from local stream to peer connection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  localStream

  // Pull tracks from remote stream, add to video stream
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

    // Start processing video frames for hand gesture detection
  // processVideoFrame();


  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
};

// 2. Create an offer
callButton.onclick = async () => {
  // Reference Firestore collections for signaling
  const callDoc = firestore.collection('calls').doc();
  const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = callDoc.collection('answerCandidates');

  callInput.value = callDoc.id;

  // Get candidates for caller, save to db
  pc.onicecandidate = (event) => {
    event.candidate && offerCandidates.add(event.candidate.toJSON());
  };

  // Create offer
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  await callDoc.set({ offer });

  // Listen for remote answer
  callDoc.onSnapshot((snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  // When answered, add candidate to peer connection
  answerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });

  hangupButton.disabled = false;
};

// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
  const callId = callInput.value;
  const callDoc = firestore.collection('calls').doc(callId);
  const answerCandidates = callDoc.collection('answerCandidates');
  const offerCandidates = callDoc.collection('offerCandidates');

  pc.onicecandidate = (event) => {
    event.candidate && answerCandidates.add(event.candidate.toJSON());
  };

  const callData = (await callDoc.get()).data();

  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await callDoc.update({ answer });

  offerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log(change);
      if (change.type === 'added') {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
};
