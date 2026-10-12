process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const https = require('https');

https.get('https://firestore.googleapis.com/v1/projects/crm-gestao-mldu/databases/(default)/documents/construcao?pageSize=1000', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const json = JSON.parse(data);
        if (!json.documents) {
            console.log("No documents found or error:", json);
            return;
        }
        json.documents.forEach(doc => {
            const docId = doc.name.split('/').pop();
            const history = doc.fields.history;
            if (history && history.arrayValue && history.arrayValue.values) {
                history.arrayValue.values.forEach(val => {
                    const stage = val.mapValue.fields.stage;
                    if (stage && stage.stringValue) {
                        console.log('Found manual entry in Title:', docId, 'Stage:', stage.stringValue);
                    }
                });
            }
        });
    });
}).on('error', (err) => {
    console.error('Error:', err.message);
});
