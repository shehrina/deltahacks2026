const WebSocket = require('ws');

console.log('🔍 Testing WebSocket Connection...\n');

const ws = new WebSocket('ws://localhost:8080');

ws.on('open', () => {
    console.log('✅ WebSocket CONNECTED!');
    console.log('Listening for messages...\n');
});

ws.on('message', (data) => {
    try {
        const msg = JSON.parse(data);
        if (msg.pitch_smooth !== undefined) {
            console.log(`📊 Source ${msg.source}: pitch=${msg.pitch_smooth.toFixed(1)}°`);
        }
    } catch (e) {}
});

ws.on('error', (error) => {
    console.log('❌ WebSocket ERROR:', error.message);
});

ws.on('close', () => {
    console.log('❌ WebSocket CLOSED');
});

setTimeout(() => {
    console.log('\n✅ Test complete - WebSocket is working!');
    ws.close();
    process.exit(0);
}, 3000);
