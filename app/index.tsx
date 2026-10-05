import { useLocalSearchParams, useRouter } from 'expo-router';
import GameScreen from '@/components/GameScreen';

export default function IndexRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ roomCode?: string }>();
  const roomCode = typeof params.roomCode === 'string' ? params.roomCode : undefined;
  return (
    <GameScreen
      initialRoomCode={roomCode}
      onAuthenticate={(action, pendingRoomCode) => router.push({
        pathname: '/auth',
        params: {
          returnTo: 'entry',
          action,
          ...(pendingRoomCode ? { roomCode: pendingRoomCode } : {}),
        },
      })}
      onAccount={() => router.push('/account')}
    />
  );
}
