import { render, screen, userEvent } from '@testing-library/react-native';
import { RoomEntry } from '../RoomEntry';

describe('RoomEntry', () => {
  it('offers create and join and normalizes a room code', async () => {
    const user = userEvent.setup();
    const onCreate = jest.fn();
    const onJoin = jest.fn();
    await render(<RoomEntry onCreate={onCreate} onJoin={onJoin} error={null} busy={false} />);

    expect(screen.getByRole('button', { name: 'Create Room' })).toBeOnTheScreen();
    await user.type(screen.getByLabelText('Room code'), ' abcd23 ');
    await user.press(screen.getByRole('button', { name: 'Join Room' }));

    expect(onJoin).toHaveBeenCalledWith('ABCD23');
    expect(onCreate).not.toHaveBeenCalled();
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
      />,
    );

    await user.type(screen.getByLabelText('Room code'), 'bad');
    await user.press(screen.getByRole('button', { name: 'Join Room' }));

    expect(screen.getByText('Enter a valid 6-character room code.')).toBeOnTheScreen();
    expect(screen.getByText('Room was not found.')).toBeOnTheScreen();
    expect(onJoin).not.toHaveBeenCalled();
  });

  it('shows a caller-provided busy label while room controls are disabled', async () => {
    await render(
      <RoomEntry
        onCreate={jest.fn()}
        onJoin={jest.fn()}
        error={null}
        busy
        busyLabel="LEAVING…"
      />,
    );

    expect(screen.getByRole('button', { name: 'LEAVING…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Join Room' })).toBeDisabled();
    expect(screen.getByLabelText('Room code')).toBeDisabled();
  });
});
