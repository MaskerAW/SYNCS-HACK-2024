import './style_new.css';

import firebase from 'firebase/app';
import 'firebase/firestore';

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
//const webcamButton = document.getElementById('webcamButton');
const answerButton = document.getElementById('join-btn');
const callInput = document.getElementById('room-id');

let roomTittle = document.getElementById('room-tittle');
let webcamVideo = document.getElementById('webcamVideo');
let callButton = document.getElementById('create-room-btn');
let remoteVideo = document.getElementById('remoteVideo');
let hangupButton = document.getElementById('leave-btn');

// 1. Setup media sources

// webcamButton.onclick = async () => {
//   localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
//   remoteStream = new MediaStream();

//   // Push tracks from local stream to peer connection
//   localStream.getTracks().forEach((track) => {
//     pc.addTrack(track, localStream);
//   });

//   // Pull tracks from remote stream, add to video stream
//   // pc.ontrack = (event) => {
//   //   event.streams[0].getTracks().forEach((track) => {
//   //     remoteStream.addTrack(track);
//   //   });
//   // };
//   pc.addEventListener("track", (event) => {
//     event.streams[0].getTracks().forEach((track) => {
//       remoteStream.addTrack(track);
//     });
//     remoteVideo.srcObject = null;

//   })



//   webcamVideo.srcObject = localStream;
//   remoteVideo.srcObject = remoteStream;

//   callButton.disabled = false;
//   answerButton.disabled = false;
//   webcamButton.disabled = true;
// };

// 2. Create an offer
callButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  remoteStream = new MediaStream();

  // Push tracks from local stream to peer connection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Pull tracks from remote stream, add to video stream
  // pc.ontrack = (event) => {
  //   event.streams[0].getTracks().forEach((track) => {
  //     remoteStream.addTrack(track);
  //   });
  // };
  pc.addEventListener("track", (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
    pc.removeEventListener("track", (event) => {
      remoteVideo.srcObject = null;
    })

  })

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;


  // Reference Firestore collections for signaling
  const callDoc = firestore.collection('calls').doc();
  const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = callDoc.collection('answerCandidates');


  if (roomTittle) {
    roomTittle.textContent = "GestureLink Meeting | Room ID# " + callDoc.id;
  } else {
    console.error("room-tittle element not found.");
  }

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

  //hangupButton.disabled = false;
};

// 3. Answer the call with the unique ID

document.getElementById("join-btn").addEventListener("click", loadRoom);
answerButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  remoteStream = new MediaStream();

  // Push tracks from local stream to peer connection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Pull tracks from remote stream, add to video stream
  // pc.ontrack = (event) => {
  //   event.streams[0].getTracks().forEach((track) => {
  //     remoteStream.addTrack(track);
  //   });
  // };
  pc.addEventListener("track", (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
    pc.removeEventListener("track", (event) => {
      remoteVideo.srcObject = null;
    })

  })

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  const callId = callInput.value;
  const callDoc = firestore.collection('calls').doc(callId);
  const answerCandidates = callDoc.collection('answerCandidates');
  const offerCandidates = callDoc.collection('offerCandidates');

  if (roomTittle) {
    roomTittle.textContent = "GestureLink Meeting | Room ID# " + callId;
  } else {
    console.error("room-tittle element not found.");
  }

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




document.getElementById("create-room-btn").addEventListener("click", loadRoom);

function loadRoom() {
  const container = document.querySelector(".container");
  if (container) {
    container.remove();
  }

  const newContent = `
            <div class="header">
                <h1 id="room-tittle">GestureLink Meeting | Room ID#abc123</h1>
            </div>
            <div class="main">
                <div class="video-section">
                    <div class="video-feed">
                        <video id="remoteVideo" autoplay="" playsinline="" data-video="1"></video>
                    </div>
                    <div class="self-camera">
                        <video id="webcamVideo" autoplay="" playsinline="" data-video="0"></video>
                    </div>
                </div>
                <div class="sidebar">
                    <div class="chat">
                        <h3>Transcript</h3>
                        <ul>
                            <li><strong>User:</strong> Hello World</li>
                        </ul>
                    </div>
                </div>
            </div>
            <div class="controls">
                <button id="leave-btn">Leave Meeting</button>
            </div>
          `;

  // Insert the new content into the body
  document.body.insertAdjacentHTML("beforeend", newContent);

  roomTittle = document.getElementById('room-tittle');
  webcamVideo = document.getElementById('webcamVideo');
  callButton = document.getElementById('create-room-btn');
  remoteVideo = document.getElementById('remoteVideo');
  hangupButton = document.getElementById('leave-btn');

  // 4. Hang up the call
  hangupButton.onclick = async () => {
    //stop connection
    pc.close();
    localStream.getTracks().forEach((track) => track.stop());

    //reset the local and remote video figs
    // webcamVideo.srcObject = null;
    remoteVideo.srcObject = null;

    //disable the hangup button and enable the webcam button again
    // hangupButton.disabled = true;
    // webcamButton.disabled = false;
    // callButton.disabled = true;
    // answerButton.disabled = true;

    const callId = callInput.value;
    if (callId) {
      await firestore.collection('calls').doc(callId).delete();
    }

    //reset call input
    //callInput.value = '';
    location.reload();
  };

  // Apply the meeting-body class to the body tag
  document.body.className = "meeting-body";
};