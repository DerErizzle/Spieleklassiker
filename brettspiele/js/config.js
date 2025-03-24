const config = {
    cdnBaseUrl: 'https://cdn-worker.eric-boingo.workers.dev',
    assetVersion: '1.0.0'
};

function getCdnUrl(assetPath) {
    return `${config.cdnBaseUrl}${assetPath}`;
}