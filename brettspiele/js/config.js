const config = {
    cdnBaseUrl: 'https://erizzle-games-assets.s3.us-east-2.amazonaws.com',
    assetVersion: '1.0.0',
};

function getCdnUrl(assetPath) {
    return `${config.cdnBaseUrl}${assetPath}?v=${config.assetVersion}`;
}

function getFallbackUrl(assetPath) {
    return `${config.fallbackBaseUrl}${assetPath.split('/').pop()}`;
}