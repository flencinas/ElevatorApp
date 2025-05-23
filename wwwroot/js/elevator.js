// Sound
function playArrivalSound() {
    const sound = document.getElementById('arrivalSound');
    if (sound) {
        sound.currentTime = 0; // Rewind to start if already playing
        sound.play().catch(error => console.error("Error playing sound:", error));
    }
}

// WebRTC
window.elevatorWebRTC = {
    pc: null,
    localStream: null,
    dotNetHelper: null,

    startCall: async function (dotNetHelperRef) {
        this.dotNetHelper = dotNetHelperRef;
        if (this.pc) {
            this.cleanup(); // Clean up previous connection if any
        }
        this.log("Starting call...");

        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            // If you have a local audio element to preview:
            // const localAudio = document.getElementById('localAudio');
            // if (localAudio) localAudio.srcObject = this.localStream;

            this.pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] // Google's public STUN server
            });

            this.pc.onicecandidate = event => {
                if (event.candidate) {
                    this.log("Generated ICE candidate: " + JSON.stringify(event.candidate));
                    this.dotNetHelper.invokeMethodAsync('AddLocalIceCandidate', JSON.stringify(event.candidate));
                }
            };

            this.pc.ontrack = event => {
                this.log("Remote track received");
                const remoteAudio = document.getElementById('remoteAudio');
                if (remoteAudio && event.streams && event.streams[0]) {
                    remoteAudio.srcObject = event.streams[0];
                    this.dotNetHelper.invokeMethodAsync('SetCallStatus', 'Connected');
                }
            };

            this.localStream.getTracks().forEach(track => this.pc.addTrack(track, this.localStream));

            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            this.log("Offer created: " + offer.sdp);
            this.dotNetHelper.invokeMethodAsync('SetLocalSdp', 'offer', offer.sdp);
            this.dotNetHelper.invokeMethodAsync('SetCallStatus', 'Offer created. Waiting for answer from Call Center.');

        } catch (e) {
            this.logError("Error starting call: " + e);
            this.dotNetHelper.invokeMethodAsync('SetCallStatus', 'Error: ' + e.message);
        }
    },

    answerCall: async function (dotNetHelperRef, offerSdp) {
        this.dotNetHelper = dotNetHelperRef;
        if (this.pc) {
            this.cleanup();
        }
        this.log("Answering call...");

        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

            this.pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });

            this.pc.onicecandidate = event => {
                if (event.candidate) {
                    this.log("Generated ICE candidate: " + JSON.stringify(event.candidate));
                    this.dotNetHelper.invokeMethodAsync('AddLocalIceCandidate', JSON.stringify(event.candidate));
                }
            };

            this.pc.ontrack = event => {
                this.log("Remote track received");
                const remoteAudio = document.getElementById('remoteAudio');
                if (remoteAudio && event.streams && event.streams[0]) {
                    remoteAudio.srcObject = event.streams[0];
                    this.dotNetHelper.invokeMethodAsync('SetCallStatus', 'Connected');
                }
            };

            this.localStream.getTracks().forEach(track => this.pc.addTrack(track, this.localStream));

            await this.pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: offerSdp }));
            this.log("Remote description (offer) set.");

            const answer = await this.pc.createAnswer();
            await this.pc.setLocalDescription(answer);
            this.log("Answer created: " + answer.sdp);
            this.dotNetHelper.invokeMethodAsync('SetLocalSdp', 'answer', answer.sdp);
            this.dotNetHelper.invokeMethodAsync('SetCallStatus', 'Answer created. Send to Elevator.');

        } catch (e) {
            this.logError("Error answering call: " + e);
            this.dotNetHelper.invokeMethodAsync('SetCallStatus', 'Error: ' + e.message);
        }
    },

    processRemoteSdp: async function (remoteSdpStr) {
        if (!this.pc) {
            this.logError("PC not initialized.");
            this.dotNetHelper.invokeMethodAsync('SetCallStatus', 'Error: PeerConnection not initialized.');
            return;
        }
        try {
            // Determine if it's an answer or an offer (though in this flow, elevator gets answer, callcenter gets offer)
            // For simplicity, we assume the type based on who calls this.
            // Elevator expects an answer, Call Center expects an offer (which is handled by answerCall)
            // So this function is primarily for the elevator side receiving an answer.
            const sdpType = this.pc.localDescription && this.pc.localDescription.type === 'offer' ? 'answer' : 'offer';

            await this.pc.setRemoteDescription(new RTCSessionDescription({ type: sdpType, sdp: remoteSdpStr }));
            this.log(`Remote SDP (${sdpType}) processed.`);
            this.dotNetHelper.invokeMethodAsync('SetCallStatus', `Remote ${sdpType} processed. Exchanging ICE candidates.`);
        } catch (e) {
            this.logError("Error processing remote SDP: " + e);
            this.dotNetHelper.invokeMethodAsync('SetCallStatus', 'Error processing remote SDP: ' + e.message);
        }
    },

    addRemoteIceCandidate: async function (candidateStr) {
        if (!this.pc) {
            this.logError("PC not initialized for adding ICE candidate.");
            return;
        }
        try {
            const candidate = JSON.parse(candidateStr);
            await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
            this.log("Remote ICE candidate added: " + candidateStr);
        } catch (e) {
            this.logError("Error adding remote ICE candidate: " + e);
        }
    },

    cleanup: function () {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        if (this.pc) {
            this.pc.close();
            this.pc = null;
        }
        this.log("WebRTC resources cleaned up.");
    },

    log: function (message) {
        console.log("[ElevatorWebRTC] " + message);
    },
    logError: function (message) {
        console.error("[ElevatorWebRTC] " + message);
    }
};