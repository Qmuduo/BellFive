import { Text, View } from '@tarojs/components';
import { createGameStore } from '../../../../src/store/createGameStore';
import './index.scss';

export default function IndexPage(): JSX.Element {
  const sharedStoreReady = typeof createGameStore === 'function';
  return (
    <View className="starter-page">
      <Text className="starter-title">BellFive</Text>
      <Text className="starter-caption">
        {sharedStoreReady ? '微信小程序与共享对局状态已就绪' : '微信小程序基础工程已就绪'}
      </Text>
    </View>
  );
}
