function testTime() {
    const now = new Date();

    console.log('UTC Time:', now.toISOString());

    // Test 1: Manual Math (Current implementation)
    const offsetHours = -6;
    const mexicoTimeManual = new Date(now.getTime() + (offsetHours * 60 * 60 * 1000));
    console.log('Manual Math (UTC-6):', mexicoTimeManual.toISOString());
    console.log('Manual Hours (getUTCHours):', mexicoTimeManual.getUTCHours());

    // Test 2: toLocaleString
    try {
        const options = {
            timeZone: 'America/Mexico_City',
            hour12: true,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        };
        console.log('toLocaleString (Mexico):', now.toLocaleString('es-MX', options));
    } catch (e) {
        console.log('toLocaleString Error:', e.message);
    }
}

testTime();
