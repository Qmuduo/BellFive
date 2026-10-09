export type BootWxApi = Pick<typeof wx, 'createCanvas' | 'getSystemInfoSync' | 'onTouchEnd'>;

export function startMiniGame(wxApi: BootWxApi) {
  const canvas = wxApi.createCanvas();
  const { windowWidth, windowHeight, pixelRatio } = wxApi.getSystemInfoSync();
  canvas.width = Math.round(windowWidth * pixelRatio);
  canvas.height = Math.round(windowHeight * pixelRatio);
  const context = canvas.getContext('2d');
  context.scale(pixelRatio, pixelRatio);

  const renderBootScreen = () => {
    context.fillStyle = '#f5f1e8';
    context.fillRect(0, 0, windowWidth, windowHeight);
    context.fillStyle = '#252b25';
    context.font = 'bold 36px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('BellFive', windowWidth / 2, windowHeight / 2);
  };

  renderBootScreen();
  wxApi.onTouchEnd(renderBootScreen);
  return canvas;
}

if (typeof wx !== 'undefined') {
  startMiniGame(wx);
}
