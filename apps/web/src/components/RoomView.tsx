import type { ItemCardRow, Room, TimelineEntry } from '../domain/types'
import { roomStatusLabel } from '../domain/utils'
import { ItemDeckSummary } from './ItemDeckSummary'
import { LobbyHostSettings } from './LobbyHostSettings'
import { LobbyTwoPlayersCTA } from './LobbyTwoPlayersCTA'
import { MatchPanel } from './MatchPanel'
import { RoomCodeCard } from './RoomCodeCard'
import { SecretPanels } from './SecretPanels'

type Derived = {
  dl: number
  canSubmitGuess: boolean
  waitingDoubleReveal: boolean
  pickDoubleRevealSlot: boolean
  doubleRevealLabel: string | null
  doubleCallHint: string | null
  hasMySecret: boolean
  waitingForOpponentSecret: boolean
  winsReq: number
  myMatchWins: number
  oppUid: string | null
  oppMatchWins: number
  timeline: TimelineEntry[]
  changeSlotSafe: number
  aloneInLobby: boolean
  twoInLobby: boolean
  isRoomHost: boolean
  roomCode: string
  canUseDouble: boolean
  canHighlow: boolean
  canTarget: boolean
  canSlash: boolean
  canShuffle: boolean
  canChange: boolean
}

type Props = {
  userId: string
  room: Room | null
  memberCount: number
  derived: Derived
  itemCards: ItemCardRow[]
  lobbyDraftDigit: 3 | 4
  setLobbyDraftDigit: (v: 3 | 4) => void
  lobbyDraftMatchWins: number
  setLobbyDraftMatchWins: (v: number) => void
  codeCopiedHint: boolean
  secretInput: string
  setSecretInput: (v: string) => void
  guessInput: string
  setGuessInput: (v: string) => void
  targetDigitInput: string
  setTargetDigitInput: (v: string) => void
  changeNewDigit: string
  setChangeNewDigit: (v: string) => void
  setChangeSlot: (v: number) => void
  leaveRoom: () => void
  copyRoomCode: () => void
  handleSaveLobbySettings: (overrides?: { digitLength?: 3 | 4; matchWinsRequired?: number }) => void
  handleHostBeginSecretSetup: () => void
  handleSaveSecret: () => void
  handleGuess: () => void
  handleDoubleStart: () => void
  handleDoubleRevealPick: (slot: number) => void
  handleItemHighlow: () => void
  handleItemTarget: () => void
  handleItemSlash: () => void
  handleItemShuffle: () => void
  handleItemChange: () => void
}

export function RoomView({
  userId,
  room,
  memberCount,
  derived,
  itemCards,
  lobbyDraftDigit,
  setLobbyDraftDigit,
  lobbyDraftMatchWins,
  setLobbyDraftMatchWins,
  codeCopiedHint,
  secretInput,
  setSecretInput,
  guessInput,
  setGuessInput,
  targetDigitInput,
  setTargetDigitInput,
  changeNewDigit,
  setChangeNewDigit,
  setChangeSlot,
  leaveRoom,
  copyRoomCode,
  handleSaveLobbySettings,
  handleHostBeginSecretSetup,
  handleSaveSecret,
  handleGuess,
  handleDoubleStart,
  handleDoubleRevealPick,
  handleItemHighlow,
  handleItemTarget,
  handleItemSlash,
  handleItemShuffle,
  handleItemChange,
}: Props) {
  const {
    dl,
    canSubmitGuess,
    waitingDoubleReveal,
    pickDoubleRevealSlot,
    doubleRevealLabel,
    doubleCallHint,
    hasMySecret,
    waitingForOpponentSecret,
    winsReq,
    myMatchWins,
    oppUid,
    oppMatchWins,
    timeline,
    changeSlotSafe,
    aloneInLobby,
    twoInLobby,
    isRoomHost,
    roomCode,
    canUseDouble,
    canHighlow,
    canTarget,
    canSlash,
    canShuffle,
    canChange,
  } = derived

  const showRoomCode =
    !room || (room.status !== 'playing' && room.status !== 'finished')

  return (
    <section style={{ marginTop: '1.25rem' }}>
      <button type="button" style={{ marginTop: 16, marginBottom: 16 }} onClick={leaveRoom}>
        もどる
      </button>
      {showRoomCode ? (
        <RoomCodeCard
          roomCode={roomCode}
          codeCopiedHint={codeCopiedHint}
          aloneInLobby={aloneInLobby}
          twoInLobby={twoInLobby}
          onCopy={copyRoomCode}
        />
      ) : null}
      <p style={{ fontSize: '0.9rem', color: '#444' }}>
        メンバー {memberCount} / 2 · {roomStatusLabel(room?.status)}
        {room && winsReq > 1 ? (
          <>
            {' '}
            · マッチ 先取 {winsReq} · ゲーム {room.current_game_index ?? 1} · 勝数 {myMatchWins}–{oppMatchWins}
          </>
        ) : null}
      </p>

      {room?.status === 'lobby' && isRoomHost ? (
        <LobbyHostSettings
          lobbyDraftDigit={lobbyDraftDigit}
          onLobbyDraftDigitChange={setLobbyDraftDigit}
          lobbyDraftMatchWins={lobbyDraftMatchWins}
          onLobbyDraftMatchWinsChange={setLobbyDraftMatchWins}
          onSaveLobbySettings={handleSaveLobbySettings}
        />
      ) : null}

      {twoInLobby && room ? (
        <LobbyTwoPlayersCTA room={room} isRoomHost={isRoomHost} onHostBeginSecretSetup={handleHostBeginSecretSetup} />
      ) : null}

      {room ? (
        <ItemDeckSummary
          userId={userId}
          room={room}
          memberCount={memberCount}
          itemCards={itemCards}
          oppUid={oppUid}
        />
      ) : null}

      {room ? (
        <SecretPanels
          room={room}
          dl={dl}
          winsReq={winsReq}
          memberCount={memberCount}
          secretInput={secretInput}
          onSecretInputChange={setSecretInput}
          onSaveSecret={handleSaveSecret}
          hasMySecret={hasMySecret}
          waitingForOpponentSecret={waitingForOpponentSecret}
        />
      ) : null}

      {room && (room.status === 'playing' || room.status === 'finished') ? (
        <MatchPanel
          room={room}
          userId={userId}
          dl={dl}
          timeline={timeline}
          doubleRevealLabel={doubleRevealLabel}
          waitingDoubleReveal={waitingDoubleReveal}
          pickDoubleRevealSlot={pickDoubleRevealSlot}
          canSubmitGuess={canSubmitGuess}
          doubleCallHint={doubleCallHint}
          guessInput={guessInput}
          onGuessInputChange={setGuessInput}
          onGuess={handleGuess}
          onDoubleRevealPick={handleDoubleRevealPick}
          canUseDouble={canUseDouble}
          canHighlow={canHighlow}
          canTarget={canTarget}
          canSlash={canSlash}
          canShuffle={canShuffle}
          canChange={canChange}
          onDoubleStart={handleDoubleStart}
          onItemHighlow={handleItemHighlow}
          onItemTarget={handleItemTarget}
          onItemSlash={handleItemSlash}
          onItemShuffle={handleItemShuffle}
          onItemChange={handleItemChange}
          targetDigitInput={targetDigitInput}
          onTargetDigitInputChange={setTargetDigitInput}
          changeSlotSafe={changeSlotSafe}
          onChangeSlot={setChangeSlot}
          changeNewDigit={changeNewDigit}
          onChangeNewDigitChange={setChangeNewDigit}
        />
      ) : null}
    </section>
  )
}
