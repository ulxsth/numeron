import { AuthBooting } from './components/AuthBooting'
import { RoomGate } from './components/RoomGate'
import { RoomView } from './components/RoomView'
import { SupabaseNotConfigured } from './components/SupabaseNotConfigured'
import { useNumeronGame } from './hooks/useNumeronGame'

export function App() {
  const g = useNumeronGame()

  if (!g.isSupabaseConfigured) {
    return <SupabaseNotConfigured />
  }

  if (g.booting || !g.userId) {
    return <AuthBooting error={g.error} />
  }

  const userId = g.userId

  return (
    <main style={{ fontFamily: 'system-ui', padding: '1.5rem', maxWidth: 560 }}>
      <h1 style={{ fontSize: '1.25rem' }}>Numer0n</h1>
      {g.error ? (
        <p style={{ color: '#b00', marginTop: '1rem' }} role="alert">
          {g.error}
        </p>
      ) : null}

      {!g.roomId ? (
        <RoomGate
          joinCode={g.joinCode}
          onJoinCodeChange={g.setJoinCode}
          onCreateRoom={g.handleCreateRoom}
          onJoinRoom={g.handleJoinRoom}
        />
      ) : (
        <RoomView
          userId={userId}
          room={g.room}
          memberCount={g.memberCount}
          mySecretDigits={g.mySecretDigits}
          oppSecretDigits={g.oppSecretDigits}
          derived={g.derived}
          itemCards={g.itemCards}
          lobbyDraftDigit={g.lobbyDraftDigit}
          setLobbyDraftDigit={g.setLobbyDraftDigit}
          lobbyDraftMatchWins={g.lobbyDraftMatchWins}
          setLobbyDraftMatchWins={g.setLobbyDraftMatchWins}
          codeCopiedHint={g.codeCopiedHint}
          secretInput={g.secretInput}
          setSecretInput={g.setSecretInput}
          guessInput={g.guessInput}
          setGuessInput={g.setGuessInput}
          targetDigitInput={g.targetDigitInput}
          setTargetDigitInput={g.setTargetDigitInput}
          changeNewDigit={g.changeNewDigit}
          setChangeNewDigit={g.setChangeNewDigit}
          setChangeSlot={g.setChangeSlot}
          leaveRoom={g.leaveRoom}
          copyRoomCode={g.copyRoomCode}
          handleSaveLobbySettings={g.handleSaveLobbySettings}
          handleHostBeginSecretSetup={g.handleHostBeginSecretSetup}
          handleConfirmNextRound={g.handleConfirmNextRound}
          handleSaveSecret={g.handleSaveSecret}
          handleGuess={g.handleGuess}
          handleDoubleStart={g.handleDoubleStart}
          handleDoubleRevealPick={g.handleDoubleRevealPick}
          handleItemHighlow={g.handleItemHighlow}
          handleItemTarget={g.handleItemTarget}
          handleItemSlash={g.handleItemSlash}
          handleItemShuffle={g.handleItemShuffle}
          handleItemChange={g.handleItemChange}
        />
      )}
    </main>
  )
}
