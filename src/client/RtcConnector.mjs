// Actor Model-inspired design
class ConnectionState {
    constructor() {
        this.signalingState = 'new' // new, have-local-offer, have-remote-offer, stable
        this.dataChannelState = 'closed' // open, closed
        this.connectionState = 'new' // new, connecting, connected, disconnected, failed, closed
        this.localSDP = null
        this.remoteSDP = null
        this.localICECandidates = []
        this.remoteICECandidates = []
        this.messageHistory = []
    }
}

class PeerConnectionActor {
    constructor(callbacks = {}, options = {}) {
        this.state = new ConnectionState()
        this.pc = new RTCPeerConnection(options.rtcConfig || {})
        this.dataChannel = null
        this.localStream = null
        this.remoteStream = null
        this.callbacks = callbacks // { onStateChange, onMessage, onIceCandidate, onDataChannelState, onRemoteStream }
    }

    async setLocalStream(stream) {
        this.localStream = stream
        for (const track of stream.getTracks()) {
            const exists = this.pc.getSenders().some(sender => sender.track?.id === track.id)
            if (!exists) {
                this.pc.addTrack(track, stream)
            }
        }
    }

    setupCommon() {
        this.pc.onicecandidate = e => {
            if (e.candidate) {
                this.state.localICECandidates.push(e.candidate)
                if (this.callbacks.onIceCandidate) {
                    this.callbacks.onIceCandidate(e.candidate)
                }
            }
        }
        this.pc.onconnectionstatechange = () => {
            this.state.connectionState = this.pc.connectionState
            if (this.callbacks.onStateChange) {
                this.callbacks.onStateChange(this.state)
            }
        }
        this.pc.ontrack = e => {
            const signaledStream = e.streams?.[0]
            if (signaledStream) {
                const streamChanged = !this.remoteStream || this.remoteStream.id !== signaledStream.id
                this.remoteStream = signaledStream
                if (streamChanged && this.callbacks.onRemoteStream) {
                    this.callbacks.onRemoteStream(this.remoteStream)
                }
                return
            }

            if (!this.remoteStream) {
                this.remoteStream = new MediaStream()
                if (this.callbacks.onRemoteStream) {
                    this.callbacks.onRemoteStream(this.remoteStream)
                }
            }
            if (!e.track) {
                return
            }
            const hasTrack = this.remoteStream.getTracks().some(track => track.id === e.track.id)
            if (!hasTrack) {
                this.remoteStream.addTrack(e.track)
            }
        }
    }

    setupDataChannel(dc) {
        dc.onopen = () => {
            this.state.dataChannelState = 'open'
            if (this.callbacks.onDataChannelState) {
                this.callbacks.onDataChannelState('open')
            }
        }
        dc.onclose = () => {
            this.state.dataChannelState = 'closed'
            if (this.callbacks.onDataChannelState) {
                this.callbacks.onDataChannelState('closed')
            }
        }
        dc.onmessage = e => {
            this.state.messageHistory.push({ direction: 'in', data: e.data })
            if (this.callbacks.onMessage) {
                this.callbacks.onMessage(e.data)
            }
        }
    }

    async handle(message) {
        switch (message.type) {
            case 'add-remote-ice':
                await this.addRemoteIce(message.candidate)
                break
            case 'send-data':
                this.sendData(message.data)
                break
            case 'set-local-stream':
                await this.setLocalStream(message.stream)
                break
        }
    }

    async addRemoteIce(candidate) {
        const iceCandidate = candidate instanceof RTCIceCandidate ? candidate : new RTCIceCandidate(candidate)
        await this.pc.addIceCandidate(iceCandidate)
        this.state.remoteICECandidates.push(candidate)
        if (this.callbacks.onStateChange) {
            this.callbacks.onStateChange(this.state)
        }
    }

    sendData(data) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(data)
            this.state.messageHistory.push({ direction: 'out', data })
            if (this.callbacks.onMessage) {
                this.callbacks.onMessage(data)
            }
        }
    }

    close() {
        if (this.dataChannel) {
            try {
                this.dataChannel.close()
            } catch (error) {
                // ignore data channel close errors during teardown
            }
        }
        this.pc.close()
    }
}

class OffererConnectionActor extends PeerConnectionActor {
    constructor(callbacks = {}, options = {}) {
        super(callbacks, options)
        this.setupCommon()
        this.dataChannel = this.pc.createDataChannel('data')
        this.setupDataChannel(this.dataChannel)
    }

    async handle(message) {
        switch (message.type) {
            case 'create-offer':
                await this.createOffer()
                break
            case 'set-remote-answer':
                await this.setRemoteAnswer(message.sdp)
                break
            case 'set-local-stream':
                await this.setLocalStream(message.stream)
                break
            default:
                await super.handle(message)
        }
    }

    async createOffer() {
        const offer = await this.pc.createOffer()
        await this.pc.setLocalDescription(offer)
        this.state.localSDP = this.pc.localDescription
        this.state.signalingState = 'have-local-offer'
        if (this.callbacks.onStateChange) {
            this.callbacks.onStateChange(this.state)
        }
    }

    async setRemoteAnswer(sdp) {
        await this.pc.setRemoteDescription(new RTCSessionDescription(sdp))
        this.state.remoteSDP = sdp
        this.state.signalingState = 'stable'
        if (this.callbacks.onStateChange) {
            this.callbacks.onStateChange(this.state)
        }
    }
}

class AnswererConnectionActor extends PeerConnectionActor {
    constructor(callbacks = {}, options = {}) {
        super(callbacks, options)
        this.setupCommon()
        this.pc.ondatachannel = e => {
            this.dataChannel = e.channel
            this.setupDataChannel(this.dataChannel)
        }
    }

    async handle(message) {
        switch (message.type) {
            case 'set-remote-offer':
                await this.setRemoteOffer(message.sdp)
                break
            case 'create-answer':
                await this.createAnswer()
                break
            case 'set-local-stream':
                await this.setLocalStream(message.stream)
                break
            default:
                await super.handle(message)
        }
    }

    async setRemoteOffer(sdp) {
        await this.pc.setRemoteDescription(new RTCSessionDescription(sdp))
        this.state.remoteSDP = sdp
        this.state.signalingState = 'have-remote-offer'
        if (this.callbacks.onStateChange) {
            this.callbacks.onStateChange(this.state)
        }
    }

    async createAnswer() {
        const answer = await this.pc.createAnswer()
        await this.pc.setLocalDescription(answer)
        this.state.localSDP = this.pc.localDescription
        this.state.signalingState = 'stable'
        if (this.callbacks.onStateChange) {
            this.callbacks.onStateChange(this.state)
        }
    }
}

export { OffererConnectionActor, AnswererConnectionActor, ConnectionState }
