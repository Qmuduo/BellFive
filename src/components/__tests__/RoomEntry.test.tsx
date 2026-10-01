import { useState } from 'react';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import type { PlayerProfile, PlayerProfileInput } from '../../profile';
import type { GameClientError } from '../../network/GameClient';
import { RoomEntry } from '../RoomEntry';

describe('RoomEntry', () => {
  it('edits a local profile and sends it with create and join requests', async () => {
    const user = userEvent.setup();
    const onCreate = jest.fn();
    const onJoin = jest.fn();
    await render(
      <ControlledRoomEntry onCreate={onCreate} onJoin={onJoin} error={null} busy={false} profileHydrated />,
    );

    fireEvent.changeText(screen.getByLabelText('Nickname'), 'Kai');
    await user.press(screen.getByRole('button', { name: 'bell avatar' }));
    await user.press(screen.getByRole('button', { name: 'Create Room' }));
    expect(onCreate).toHaveBeenCalledWith({ nickname: 'Kai', avatarId: 'bell' });

    await user.type(screen.getByLabelText('Room code'), ' abcd23 ');
    await user.press(screen.getByRole('button', { name: 'Join Room' }));
    expect(onJoin).toHaveBeenCalledWith('ABCD23', { nickname: 'Kai', avatarId: 'bell' });
  });

  it('shows validation and server errors', async () => {
    const user = userEvent.setup();
    const onJoin = jest.fn();
    await render(
      <RoomEntry
        onCreate={jest.fn()}
        onJoin={onJoin}
        error={{ code: 'ROOM_NOT_FOUND', message: 'Room was not found.' }}
        busy={false}
        profile={{ nickname: '', avatarId: 'strawberry' }}
        profileHydrated
        onProfileChange={jest.fn()}
      />,
    );

    await user.type(screen.getByLabelText('Room code'), 'bad');
    await user.press(screen.getByRole('button', { name: 'Join Room' }));

    expect(screen.getByText('Enter a valid 6-character room code.')).toBeOnTheScreen();
    expect(screen.getByText('Room was not found.')).toBeOnTheScreen();
    expect(onJoin).not.toHaveBeenCalled();
  });

  it('waits for local profile hydration before enabling create and join', async () => {
    await render(
      <RoomEntry
        onCreate={jest.fn()}
        onJoin={jest.fn()}
        error={null}
        busy={false}
        profile={{ nickname: '', avatarId: 'strawberry' }}
        profileHydrated={false}
        onProfileChange={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'LOADING PROFILE…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Join Room' })).toBeDisabled();
    expect(screen.getByLabelText('Room code')).toBeDisabled();
    expect(screen.getByLabelText('Nickname')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'banana avatar' })).toBeDisabled();
  });

  it('shows a caller-provided busy label while room controls are disabled', async () => {
    await render(
      <RoomEntry
        onCreate={jest.fn()}
        onJoin={jest.fn()}
        error={null}
        busy
        busyLabel="LEAVING…"
        profile={{ nickname: '', avatarId: 'strawberry' }}
        profileHydrated
        onProfileChange={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'LEAVING…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Join Room' })).toBeDisabled();
    expect(screen.getByLabelText('Room code')).toBeDisabled();
  });
});

function ControlledRoomEntry({
  onCreate,
  onJoin,
  error,
  busy,
  profileHydrated,
}: {
  onCreate: (profile: PlayerProfileInput) => void;
  onJoin: (roomCode: string, profile: PlayerProfileInput) => void;
  error: GameClientError | null;
  busy: boolean;
  profileHydrated: boolean;
}) {
  const [profile, setProfile] = useState<PlayerProfile>({ nickname: 'Mira', avatarId: 'pear' });
  return (
    <RoomEntry
      onCreate={onCreate}
      onJoin={onJoin}
      error={error}
      busy={busy}
      profile={profile}
      profileHydrated={profileHydrated}
      onProfileChange={setProfile}
    />
  );
}
