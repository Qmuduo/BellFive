import { useState } from 'react';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import type { PlayerProfile } from '../../profile';
import type { GameClientError } from '../../network/GameClient';
import { RoomEntry } from '../RoomEntry';
import { useSettingsStore } from '../../store/settingsStore';

describe('RoomEntry', () => {
  beforeEach(() => {
    useSettingsStore.setState({ language: 'en', hydrated: true });
  });

  it('edits a local profile and sends create and join requests without profile arguments', async () => {
    const user = userEvent.setup();
    const onCreate = jest.fn();
    const onJoin = jest.fn();
    await render(
      <ControlledRoomEntry onCreate={onCreate} onJoin={onJoin} error={null} busy={false} profileHydrated />,
    );

    fireEvent.changeText(screen.getByLabelText('Nickname'), 'Kai');
    await user.press(screen.getByRole('button', { name: 'bell avatar' }));
    await user.press(screen.getByRole('button', { name: 'Create Room' }));
    expect(onCreate).toHaveBeenCalledWith();

    await user.type(screen.getByLabelText('Room code'), ' abcd23 ');
    await user.press(screen.getByRole('button', { name: 'Join Room' }));
    expect(onJoin).toHaveBeenCalledWith('ABCD23');
  });

  it('defaults entry copy to Chinese and switches to English in place', async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({ language: 'zh-CN', hydrated: true });
    await render(
      <RoomEntry
        onCreate={jest.fn()}
        onJoin={jest.fn()}
        error={null}
        busy={false}
        profile={{ nickname: '', avatarId: 'strawberry' }}
        profileHydrated
        onProfileChange={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '创建房间' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: '语言设置' }));
    await user.press(screen.getByRole('button', { name: /English/ }));
    expect(screen.getByRole('button', { name: 'Create Room' })).toBeOnTheScreen();
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
    expect(screen.getByText('That room is closed or no longer exists. Return to the lobby.')).toBeOnTheScreen();
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

  it('shows public rooms and lets a player request entry from the list', async () => {
    const user = userEvent.setup();
    const onJoin = jest.fn();
    const onRefresh = jest.fn();
    await render(
      <RoomEntry
        onCreate={jest.fn()}
        onJoin={onJoin}
        error={null}
        busy={false}
        profile={{ nickname: 'Kai', avatarId: 'banana' }}
        profileHydrated
        onProfileChange={jest.fn()}
        openRooms={[{ roomCode: 'ABCD23', hostProfile: { nickname: 'Mira', avatarId: 'peach' } }]}
        onRefreshLobby={onRefresh}
      />,
    );

    expect(screen.getByText('Mira · Player A · ABCD23')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Refresh rooms' }));
    await user.press(screen.getByRole('button', { name: 'Request to join ABCD23' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onJoin).toHaveBeenCalledWith('ABCD23');
  });

  it('shows the application status and lets the requester cancel it', async () => {
    const user = userEvent.setup();
    const onCancelApplication = jest.fn();
    await render(
      <RoomEntry
        onCreate={jest.fn()}
        onJoin={jest.fn()}
        error={null}
        busy={false}
        profile={{ nickname: 'Kai', avatarId: 'banana' }}
        profileHydrated
        onProfileChange={jest.fn()}
        applicationStatus={{ type: 'room.application.status', applicationId: 'app-local', status: 'pending', message: 'Waiting for approval.' }}
        onCancelApplication={onCancelApplication}
      />,
    );

    expect(screen.getByText('Join request sent. Waiting for the host to approve it.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Create Room' })).toBeDisabled();
    await user.press(screen.getByRole('button', { name: 'Cancel Join Request' }));
    expect(onCancelApplication).toHaveBeenCalledTimes(1);
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
  onCreate: () => void;
  onJoin: (roomCode: string) => void;
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
