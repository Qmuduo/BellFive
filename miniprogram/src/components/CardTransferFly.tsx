import { useEffect, useState } from 'react';
import Taro from '@tarojs/taro';
import { Text, View } from '@tarojs/components';
import type { PlayerId } from '../../../src/game/types';
import type { RingFeedbackEvent } from '../../../src/network/protocol';

type Point = Readonly<{ x: number; y: number }>;
type Rect = Readonly<{ left: number; top: number; width: number; height: number }>;
type Anchors = Readonly<{
  table: Readonly<Record<PlayerId, Point>>;
  draw: Readonly<Record<PlayerId, Point>>;
}>;

const CARD_WIDTH = 32;
const CARD_HEIGHT = 44;
const CARD_FLIGHT_MS = 470;
const CARD_STAGGER_MS = 35;

export type CardTransferFlyProps = Readonly<{
  event: RingFeedbackEvent;
}>;

export function CardTransferFly({ event }: CardTransferFlyProps): JSX.Element | null {
  const [anchors, setAnchors] = useState<Anchors | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAnchors(null);
    setStarted(false);
    const measureTimer = setTimeout(() => {
      const query = Taro.createSelectorQuery();
      query.select('#mini-game-shell').boundingClientRect();
      query.select('#mini-card-source-a').boundingClientRect();
      query.select('#mini-card-source-b').boundingClientRect();
      query.select('#mini-draw-count-a').boundingClientRect();
      query.select('#mini-draw-count-b').boundingClientRect();
      query.exec(result => {
        if (cancelled) return;
        const [shell, tableA, tableB, drawA, drawB] = result as Array<Rect | null>;
        if (!shell || !tableA || !tableB || !drawA || !drawB) return;
        const center = (rect: Rect): Point => ({
          x: rect.left + rect.width / 2 - shell.left,
          y: rect.top + rect.height / 2 - shell.top,
        });
        setAnchors({
          table: { A: center(tableA), B: center(tableB) },
          draw: { A: center(drawA), B: center(drawB) },
        });
      });
    }, 16);
    return () => {
      cancelled = true;
      clearTimeout(measureTimer);
    };
  }, [event.version]);

  useEffect(() => {
    if (!anchors) return;
    const timer = setTimeout(() => setStarted(true), 16);
    return () => clearTimeout(timer);
  }, [anchors]);

  if (!anchors || event.movedCardCount <= 0) return null;

  const flightCount = Math.min(event.movedCardCount, 5);
  const opponent: PlayerId = event.caller === 'A' ? 'B' : 'A';
  const isCollection = event.outcome === 'correct';
  const destinationPlayer = isCollection ? event.caller : opponent;
  const badges = isCollection
    ? [{ playerId: event.caller, amount: `+${event.movedCardCount}`, negative: false }]
    : [
        { playerId: event.caller, amount: `−${event.movedCardCount}`, negative: true },
        { playerId: opponent, amount: `+${event.movedCardCount}`, negative: false },
      ];

  return (
    <View className="mini-card-flight-layer">
      {Array.from({ length: flightCount }, (_, index) => {
        const originPlayer: PlayerId = isCollection
          ? index % 2 === 0 ? 'A' : 'B'
          : event.caller;
        const origin = isCollection ? anchors.table[originPlayer] : anchors.draw[originPlayer];
        const destination = anchors.draw[destinationPlayer];
        const fanOffset = (index - (flightCount - 1) / 2) * 7;
        const startX = origin.x + fanOffset;
        const startY = origin.y + (isCollection ? 0 : fanOffset * 0.2);
        const deltaX = destination.x - startX + fanOffset * 0.15;
        const deltaY = destination.y - startY;
        const delay = index * CARD_STAGGER_MS;
        return (
          <View
            key={`${event.version}-${index}`}
            className="mini-flying-card"
            style={{
              left: `${startX - CARD_WIDTH / 2}px`,
              top: `${startY - CARD_HEIGHT / 2}px`,
              opacity: started ? 0 : 0.96,
              transform: started
                ? `translate3d(${deltaX}px, ${deltaY}px, 0) rotate(${fanOffset * 0.4}deg) scale(.55)`
                : 'translate3d(0, 0, 0) rotate(0deg) scale(1)',
              transition: `transform ${CARD_FLIGHT_MS}ms cubic-bezier(.2,.72,.28,1) ${delay}ms, opacity 360ms ease ${delay}ms`,
            }}
          >
            <Text className="mini-flying-card-mark">🔔</Text>
          </View>
        );
      })}
      {badges.map(({ playerId, amount, negative }) => {
        const point = anchors.draw[playerId];
        return (
          <Text
            key={playerId}
            className={`mini-card-flight-badge ${negative ? 'mini-card-flight-badge-negative' : ''}`}
            style={{
              left: `${point.x}px`,
              top: `${point.y}px`,
              opacity: started ? 0 : 1,
              transform: started ? 'translate(-50%, -50%) scale(1.08)' : 'translate(-50%, -50%) scale(.7)',
              transition: 'opacity 420ms ease 250ms, transform 180ms ease-out',
            }}
          >
            {amount}
          </Text>
        );
      })}
    </View>
  );
}
