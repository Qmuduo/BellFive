import { linkWechatAfterConfirmation } from '../wechatLinkConfirmation';

test('does not request a login code or link identity when transfer confirmation is cancelled', async () => {
  const getCode = jest.fn(async () => 'fresh-code');
  const link = jest.fn(async () => undefined);

  await expect(linkWechatAfterConfirmation({ username: 'kai', password: 'long-password' }, {
    confirmTransfer: async () => false,
    getCode,
    link,
  })).resolves.toBe(false);

  expect(getCode).not.toHaveBeenCalled();
  expect(link).not.toHaveBeenCalled();
});

test('links with a fresh WeChat code and sets transfer confirmation only after explicit approval', async () => {
  const getCode = jest.fn(async () => 'fresh-code');
  const link = jest.fn(async () => undefined);

  await expect(linkWechatAfterConfirmation({ username: 'kai', password: 'long-password' }, {
    confirmTransfer: async () => true,
    getCode,
    link,
  })).resolves.toBe(true);

  expect(getCode).toHaveBeenCalledTimes(1);
  expect(link).toHaveBeenCalledWith({
    username: 'kai', password: 'long-password', code: 'fresh-code', confirmedTransfer: true,
  });
});
