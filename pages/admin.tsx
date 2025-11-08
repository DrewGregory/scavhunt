import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useTeam } from '../components/useTeam';

interface Member {
  firstName: string;
  familyName?: string;
  _id?: string;
}

interface Team {
  _id: string;
  name: string;
  emoji: string;
  teamCode: string;
  members: Member[];
}

interface Challenge {
  _id: string;
  title: string;
  prompt: string;
  pts: number;
  loc: {
    lat: number;
    lng: number;
  };
  numWinners: number;
}

interface ScavAIMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface ScavAIConversation {
  _id: string;
  teamId: string;
  teamName: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  firstMessage: string;
  messages: ScavAIMessage[];
}

export default function AdminPage() {
  const currentTeam = useTeam();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'teams' | 'challenges' | 'scavai'>('teams');
  const [teams, setTeams] = useState<Team[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [scavaiConversations, setScavaiConversations] = useState<ScavAIConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ScavAIConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form states
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamEmoji, setNewTeamEmoji] = useState('');
  const [newTeamCode, setNewTeamCode] = useState('');

  const [selectedTeamForPlayer, setSelectedTeamForPlayer] = useState('');
  const [newPlayerFirstName, setNewPlayerFirstName] = useState('');
  const [newPlayerFamilyName, setNewPlayerFamilyName] = useState('');

  const [moveFromTeam, setMoveFromTeam] = useState('');
  const [moveToTeam, setMoveToTeam] = useState('');
  const [movePlayerIndex, setMovePlayerIndex] = useState('');

  // Challenge form states
  const [editingChallenge, setEditingChallenge] = useState<Challenge | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [teamsCsvFile, setTeamsCsvFile] = useState<File | null>(null);
  const [newTeamCodes, setNewTeamCodes] = useState<Array<{ name: string; emoji: string; teamCode: string }> | null>(null);

  const loadTeams = async () => {
    try {
      const res = await fetch('/api/admin/teams');
      if (res.status === 403) {
        router.push('/');
        return;
      }
      const data = await res.json();
      setTeams(data.teams);
      setLoading(false);
    } catch (err) {
      setError('Failed to load teams');
      setLoading(false);
    }
  };

  const loadChallenges = async () => {
    try {
      const res = await fetch('/api/admin/challenges');
      if (res.status === 403) {
        router.push('/');
        return;
      }
      const data = await res.json();
      setChallenges(data.challenges);
    } catch (err) {
      setError('Failed to load challenges');
    }
  };

  const loadScavAIConversations = async () => {
    try {
      const res = await fetch('/api/admin/scavai-conversations');
      if (res.status === 403) {
        router.push('/');
        return;
      }
      const data = await res.json();
      setScavaiConversations(data.conversations);
    } catch (err) {
      setError('Failed to load ScavAI conversations');
    }
  };

  useEffect(() => {
    if (currentTeam) {
      loadTeams();
      loadChallenges();
      loadScavAIConversations();
    }
  }, [currentTeam]);

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/create-team', {
        method: 'POST',
        body: JSON.stringify({
          name: newTeamName,
          emoji: newTeamEmoji,
          teamCode: newTeamCode,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to create team');
        return;
      }

      setNewTeamName('');
      setNewTeamEmoji('');
      setNewTeamCode('');
      await loadTeams();
      alert('Team created successfully!');
    } catch (err) {
      alert('Failed to create team');
    }
  };

  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/add-player', {
        method: 'POST',
        body: JSON.stringify({
          teamId: selectedTeamForPlayer,
          firstName: newPlayerFirstName,
          familyName: newPlayerFamilyName,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to add player');
        return;
      }

      setNewPlayerFirstName('');
      setNewPlayerFamilyName('');
      await loadTeams();
      alert('Player added successfully!');
    } catch (err) {
      alert('Failed to add player');
    }
  };

  const handleMovePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/move-player', {
        method: 'POST',
        body: JSON.stringify({
          fromTeamId: moveFromTeam,
          toTeamId: moveToTeam,
          playerIndex: parseInt(movePlayerIndex),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to move player');
        return;
      }

      setMovePlayerIndex('');
      await loadTeams();
      alert('Player moved successfully!');
    } catch (err) {
      alert('Failed to move player');
    }
  };

  const handleUpdateChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingChallenge) return;

    try {
      const res = await fetch('/api/admin/update-challenge', {
        method: 'PUT',
        body: JSON.stringify({
          _id: editingChallenge._id,
          title: editingChallenge.title,
          prompt: editingChallenge.prompt,
          pts: editingChallenge.pts,
          lat: editingChallenge.loc.lat,
          lng: editingChallenge.loc.lng,
          numWinners: editingChallenge.numWinners,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to update challenge');
        return;
      }

      setEditingChallenge(null);
      await loadChallenges();
      alert('Challenge updated successfully!');
    } catch (err) {
      alert('Failed to update challenge');
    }
  };


  const handleImportCSV = async () => {
    if (!csvFile) {
      alert('Please select a CSV file');
      return;
    }

    try {
      const csvContent = await csvFile.text();
      const res = await fetch('/api/admin/import-challenges', {
        method: 'POST',
        body: JSON.stringify({ csvContent }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to import challenges');
        return;
      }

      const data = await res.json();
      setCsvFile(null);
      await loadChallenges();
      alert(data.message || 'Challenges imported successfully!');
    } catch (err) {
      alert('Failed to import challenges');
    }
  };

  const handleImportTeamsCSV = async () => {
    if (!teamsCsvFile) {
      alert('Please select a CSV file');
      return;
    }

    try {
      const csvContent = await teamsCsvFile.text();
      const res = await fetch('/api/admin/import-teams', {
        method: 'POST',
        body: JSON.stringify({ csvContent }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to import teams');
        return;
      }

      const data = await res.json();
      setTeamsCsvFile(null);
      await loadTeams();
      
      // Show team codes modal if any new teams were created
      if (data.newTeamCodes && data.newTeamCodes.length > 0) {
        setNewTeamCodes(data.newTeamCodes);
      } else {
        alert(data.message || 'Teams imported successfully!');
      }
    } catch (err) {
      alert('Failed to import teams');
    }
  };

  const copyTeamCodesToClipboard = () => {
    if (!newTeamCodes) return;
    
    const text = newTeamCodes.map(tc => `${tc.emoji} ${tc.name}: ${tc.teamCode}`).join('\n');
    navigator.clipboard.writeText(text);
    alert('Team codes copied to clipboard!');
  };

  const handleDeleteChallenge = async (challengeId: string, challengeTitle: string) => {
    if (!confirm(`Are you sure you want to delete "${challengeTitle}"? This can only be done if there are no submissions for this challenge.`)) {
      return;
    }

    try {
      const res = await fetch('/api/admin/delete-challenge', {
        method: 'DELETE',
        body: JSON.stringify({ challengeId }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Failed to delete challenge');
        return;
      }

      await loadChallenges();
      alert('Challenge deleted successfully!');
    } catch (err) {
      alert('Failed to delete challenge');
    }
  };

  const handleBulkDeleteChallenges = async () => {
    if (!confirm('Are you sure you want to delete ALL challenges that have no submissions? This action cannot be undone.')) {
      return;
    }

    try {
      const res = await fetch('/api/admin/bulk-delete-challenges', {
        method: 'DELETE',
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Failed to bulk delete challenges');
        return;
      }

      await loadChallenges();
      
      let message = data.message;
      if (data.skippedCount > 0) {
        message += `\n\nSkipped ${data.skippedCount} challenge(s) with submissions.`;
      }
      if (data.deletedCount === 0) {
        message = 'No challenges were deleted. All challenges have submissions.';
      }
      
      alert(message);
    } catch (err) {
      alert('Failed to bulk delete challenges');
    }
  };

  if (!currentTeam || loading) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px', fontFamily: 'Arial, sans-serif' }}>
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px', fontFamily: 'Arial, sans-serif' }}>
        {error}
      </div>
    );
  }

  const getTeamPlayers = (teamId: string) => {
    const team = teams.find(t => t._id === teamId);
    return team?.members || [];
  };

  return (
    <>
      <style jsx>{`
        .admin-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
          font-family: Arial, sans-serif;
        }
        .title {
          font-size: 32px;
          margin-bottom: 20px;
          color: #333;
        }
        .tabs {
          display: flex;
          gap: 10px;
          margin-bottom: 30px;
          border-bottom: 2px solid #ddd;
        }
        .tab {
          padding: 12px 24px;
          font-size: 16px;
          background: none;
          border: none;
          border-bottom: 3px solid transparent;
          cursor: pointer;
          color: #666;
          font-weight: 500;
          transition: all 0.2s;
        }
        .tab:hover {
          color: #0070f3;
        }
        .tab.active {
          color: #0070f3;
          border-bottom-color: #0070f3;
        }
        .section {
          margin-bottom: 40px;
          padding: 20px;
          background-color: #f5f5f5;
          border-radius: 8px;
        }
        .section-title {
          font-size: 24px;
          margin-bottom: 20px;
          color: #555;
        }
        .form {
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-width: 100%;
        }
        .input, .select, .textarea {
          padding: 12px;
          font-size: 16px;
          border: 1px solid #ddd;
          border-radius: 4px;
          width: 100%;
          box-sizing: border-box;
        }
        .textarea {
          min-height: 100px;
          font-family: Arial, sans-serif;
          resize: vertical;
        }
        .select {
          background-color: white;
        }
        .button {
          padding: 14px;
          font-size: 16px;
          background-color: #0070f3;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: bold;
          width: 100%;
        }
        .button:hover {
          background-color: #0051cc;
        }
        .button:active {
          transform: scale(0.98);
        }
        .button-secondary {
          background-color: #6c757d;
        }
        .button-secondary:hover {
          background-color: #5a6268;
        }
        .table-container {
          overflow-x: auto;
          background-color: white;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .table {
          width: 100%;
          border-collapse: collapse;
          min-width: 600px;
        }
        .table th,
        .table td {
          padding: 12px;
          text-align: left;
          border-bottom: 1px solid #eee;
        }
        .table th {
          background-color: #f8f9fa;
          font-weight: bold;
          color: #333;
        }
        .table tr:hover {
          background-color: #f8f9fa;
        }
        .small-button {
          padding: 6px 12px;
          font-size: 14px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 500;
        }
        .edit-button {
          background-color: #0070f3;
          color: white;
        }
        .edit-button:hover {
          background-color: #0051cc;
        }
        .delete-button {
          background-color: #dc3545;
          color: white;
        }
        .delete-button:hover {
          background-color: #c82333;
        }
        .action-buttons {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }
        .modal-content {
          background-color: white;
          padding: 30px;
          border-radius: 8px;
          max-width: 600px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
        }
        .modal-title {
          font-size: 24px;
          margin-bottom: 20px;
          color: #333;
        }
        .modal-buttons {
          display: flex;
          gap: 10px;
          margin-top: 20px;
        }
        .file-input-wrapper {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }
        .file-input {
          flex: 1;
          min-width: 200px;
        }

        @media (min-width: 768px) {
          .admin-container {
            padding: 30px;
          }
          .form {
            max-width: 400px;
          }
          .button {
            width: auto;
            min-width: 150px;
          }
        }

        @media (max-width: 767px) {
          .admin-container {
            padding: 15px;
          }
          .title {
            font-size: 24px;
            margin-bottom: 15px;
          }
          .tabs {
            margin-bottom: 20px;
          }
          .tab {
            padding: 10px 16px;
            font-size: 14px;
          }
          .section {
            padding: 15px;
            margin-bottom: 20px;
          }
          .section-title {
            font-size: 20px;
            margin-bottom: 15px;
          }
          .table th,
          .table td {
            padding: 8px;
            font-size: 14px;
          }
          .modal-content {
            padding: 20px;
          }
          .modal-title {
            font-size: 20px;
          }
          .modal-buttons {
            flex-direction: column;
          }
        }
      `}</style>
      <div className="admin-container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <h1 className="title" style={{ margin: 0 }}>Admin Panel</h1>
          <button
            onClick={() => router.push('/')}
            className="button"
            style={{ width: 'auto', minWidth: '120px' }}
          >
            Return to Home
          </button>
        </div>

        <div className="tabs">
          <button
            className={`tab ${activeTab === 'teams' ? 'active' : ''}`}
            onClick={() => setActiveTab('teams')}
          >
            Teams
          </button>
          <button
            className={`tab ${activeTab === 'challenges' ? 'active' : ''}`}
            onClick={() => setActiveTab('challenges')}
          >
            Challenges
          </button>
          <button
            className={`tab ${activeTab === 'scavai' ? 'active' : ''}`}
            onClick={() => setActiveTab('scavai')}
          >
            ScavAI Conversations
          </button>
        </div>

        {activeTab === 'teams' && (
          <>
            {/* Teams List */}
            <section className="section">
              <h2 className="section-title">All Teams</h2>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Team</th>
                      <th>Members</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teams.map((team) => (
                      <tr key={team._id}>
                        <td>
                          <strong>{team.emoji} {team.name}</strong>
                        </td>
                        <td>
                          {team.members.map((member, idx) => (
                            <div key={idx}>
                              {idx + 1}. {member.firstName}{member.familyName ? ` ${member.familyName}` : ''}
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Create Team */}
            <section className="section">
              <h2 className="section-title">Create New Team</h2>
              <form onSubmit={handleCreateTeam} className="form">
                <input
                  type="text"
                  placeholder="Team Name"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  required
                  className="input"
                />
                <input
                  type="text"
                  placeholder="Emoji (e.g., 🚀)"
                  value={newTeamEmoji}
                  onChange={(e) => setNewTeamEmoji(e.target.value)}
                  required
                  className="input"
                />
                <input
                  type="text"
                  placeholder="Team Code"
                  value={newTeamCode}
                  onChange={(e) => setNewTeamCode(e.target.value)}
                  required
                  className="input"
                />
                <button type="submit" className="button">Create Team</button>
              </form>
            </section>

            {/* Add Player */}
            <section className="section">
              <h2 className="section-title">Add Player to Team</h2>
              <form onSubmit={handleAddPlayer} className="form">
                <select
                  value={selectedTeamForPlayer}
                  onChange={(e) => setSelectedTeamForPlayer(e.target.value)}
                  required
                  className="select"
                >
                  <option value="">Select Team</option>
                  {teams.map((team) => (
                    <option key={team._id} value={team._id}>
                      {team.emoji} {team.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="First Name"
                  value={newPlayerFirstName}
                  onChange={(e) => setNewPlayerFirstName(e.target.value)}
                  required
                  className="input"
                />
                <input
                  type="text"
                  placeholder="Family Name"
                  value={newPlayerFamilyName}
                  onChange={(e) => setNewPlayerFamilyName(e.target.value)}
                  required
                  className="input"
                />
                <button type="submit" className="button">Add Player</button>
              </form>
            </section>

            {/* Move Player */}
            <section className="section">
              <h2 className="section-title">Move Player Between Teams</h2>
              <form onSubmit={handleMovePlayer} className="form">
                <select
                  value={moveFromTeam}
                  onChange={(e) => setMoveFromTeam(e.target.value)}
                  required
                  className="select"
                >
                  <option value="">From Team</option>
                  {teams.map((team) => (
                    <option key={team._id} value={team._id}>
                      {team.emoji} {team.name}
                    </option>
                  ))}
                </select>
                
                {moveFromTeam && (
                  <select
                    value={movePlayerIndex}
                    onChange={(e) => setMovePlayerIndex(e.target.value)}
                    required
                    className="select"
                  >
                    <option value="">Select Player</option>
                    {getTeamPlayers(moveFromTeam).map((member, idx) => (
                      <option key={idx} value={idx}>
                        {member.firstName}{member.familyName ? ` ${member.familyName}` : ''}
                      </option>
                    ))}
                  </select>
                )}

                <select
                  value={moveToTeam}
                  onChange={(e) => setMoveToTeam(e.target.value)}
                  required
                  className="select"
                >
                  <option value="">To Team</option>
                  {teams.map((team) => (
                    <option key={team._id} value={team._id}>
                      {team.emoji} {team.name}
                    </option>
                  ))}
                </select>
                
                <button type="submit" className="button">Move Player</button>
              </form>
            </section>

            {/* Import Teams from CSV */}
            <section className="section">
              <h2 className="section-title">Import Teams from CSV</h2>
              <div className="file-input-wrapper">
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setTeamsCsvFile(e.target.files?.[0] || null)}
                  className="input file-input"
                />
                <button
                  onClick={handleImportTeamsCSV}
                  className="button"
                  disabled={!teamsCsvFile}
                >
                  Import CSV
                </button>
              </div>
              <p style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
                CSV format: Emoji, Name, Size, names (comma-separated "FirstName LastName")
              </p>
            </section>
          </>
        )}

        {activeTab === 'challenges' && (
          <>
            {/* Challenges List */}
            <section className="section">
              <h2 className="section-title">All Challenges</h2>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Points</th>
                      <th>Lat</th>
                      <th>Lng</th>
                      <th>Winners</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {challenges.map((challenge) => (
                      <tr key={challenge._id}>
                        <td>{challenge.title}</td>
                        <td>{challenge.pts}</td>
                        <td>{challenge.loc.lat.toFixed(4)}</td>
                        <td>{challenge.loc.lng.toFixed(4)}</td>
                        <td>{challenge.numWinners}</td>
                        <td>
                          <div className="action-buttons">
                            <button
                              className="small-button edit-button"
                              onClick={() => setEditingChallenge(challenge)}
                            >
                              Edit
                            </button>
                            <button
                              className="small-button delete-button"
                              onClick={() => handleDeleteChallenge(challenge._id, challenge.title)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Bulk Delete Challenges */}
            <section className="section">
              <h2 className="section-title">Bulk Delete Challenges</h2>
              <p style={{ marginBottom: '15px', fontSize: '14px', color: '#666' }}>
                Delete all challenges that have no submissions. Challenges with submissions will be skipped.
              </p>
              <button
                type="button"
                onClick={handleBulkDeleteChallenges}
                className="button"
                style={{ backgroundColor: '#dc3545', maxWidth: '300px' }}
              >
                Bulk Delete Unused Challenges
              </button>
            </section>

            {/* Import CSV */}
            <section className="section">
              <h2 className="section-title">Import Challenges from CSV</h2>
              <div className="file-input-wrapper">
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                  className="input file-input"
                />
                <button
                  onClick={handleImportCSV}
                  className="button"
                  disabled={!csvFile}
                >
                  Import CSV
                </button>
              </div>
              <p style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
                CSV format: title, prompt, pts, (ignored), lat, lng, numWinners
              </p>
            </section>
          </>
        )}

        {activeTab === 'scavai' && (
          <>
            {/* ScavAI Conversations List */}
            <section className="section">
              <h2 className="section-title">All ScavAI Conversations</h2>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Team</th>
                      <th>Messages</th>
                      <th>First Message</th>
                      <th>Started</th>
                      <th>Last Updated</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scavaiConversations.map((conversation) => (
                      <tr key={conversation._id}>
                        <td><strong>{conversation.teamName}</strong></td>
                        <td>{conversation.messageCount}</td>
                        <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {conversation.firstMessage}
                        </td>
                        <td>{new Date(conversation.createdAt).toLocaleString()}</td>
                        <td>{new Date(conversation.updatedAt).toLocaleString()}</td>
                        <td>
                          <button
                            className="small-button edit-button"
                            onClick={() => setSelectedConversation(conversation)}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {scavaiConversations.length === 0 && (
                <p style={{ textAlign: 'center', marginTop: '20px', color: '#666' }}>
                  No ScavAI conversations yet.
                </p>
              )}
            </section>
          </>
        )}

        {/* Edit Challenge Modal */}
        {editingChallenge && (
          <div className="modal" onClick={() => setEditingChallenge(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h2 className="modal-title">Edit Challenge</h2>
              <form onSubmit={handleUpdateChallenge} className="form">
                <input
                  type="text"
                  placeholder="Title"
                  value={editingChallenge.title}
                  onChange={(e) => setEditingChallenge({ ...editingChallenge, title: e.target.value })}
                  required
                  className="input"
                />
                <textarea
                  placeholder="Prompt"
                  value={editingChallenge.prompt}
                  onChange={(e) => setEditingChallenge({ ...editingChallenge, prompt: e.target.value })}
                  required
                  className="textarea"
                />
                <input
                  type="number"
                  placeholder="Points"
                  value={editingChallenge.pts}
                  onChange={(e) => setEditingChallenge({ ...editingChallenge, pts: Number(e.target.value) })}
                  required
                  className="input"
                />
                <input
                  type="number"
                  step="any"
                  placeholder="Latitude"
                  value={editingChallenge.loc.lat}
                  onChange={(e) => setEditingChallenge({ 
                    ...editingChallenge, 
                    loc: { ...editingChallenge.loc, lat: Number(e.target.value) }
                  })}
                  required
                  className="input"
                />
                <input
                  type="number"
                  step="any"
                  placeholder="Longitude"
                  value={editingChallenge.loc.lng}
                  onChange={(e) => setEditingChallenge({ 
                    ...editingChallenge, 
                    loc: { ...editingChallenge.loc, lng: Number(e.target.value) }
                  })}
                  required
                  className="input"
                />
                <input
                  type="number"
                  placeholder="Number of Winners"
                  value={editingChallenge.numWinners}
                  onChange={(e) => setEditingChallenge({ ...editingChallenge, numWinners: Number(e.target.value) })}
                  required
                  className="input"
                />
                <div className="modal-buttons">
                  <button type="submit" className="button">Save Changes</button>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setEditingChallenge(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

         {/* ScavAI Conversation Modal */}
         {selectedConversation && (
           <div className="modal" onClick={() => setSelectedConversation(null)}>
             <div className="modal-content" onClick={(e) => e.stopPropagation()}>
               <h2 className="modal-title">
                 ScavAI Conversation - {selectedConversation.teamName}
               </h2>
               <p style={{ fontSize: '14px', color: '#666', marginBottom: '20px' }}>
                 Started: {new Date(selectedConversation.createdAt).toLocaleString()}
                 {' | '}
                 Last Updated: {new Date(selectedConversation.updatedAt).toLocaleString()}
               </p>
               <div style={{
                 maxHeight: '60vh',
                 overflowY: 'auto',
                 border: '1px solid #ddd',
                 borderRadius: '8px',
                 padding: '20px',
                 backgroundColor: '#f9f9f9'
               }}>
                 {selectedConversation.messages.map((message, index) => (
                   <div
                     key={index}
                     style={{
                       marginBottom: '16px',
                       padding: '12px',
                       borderRadius: '8px',
                       backgroundColor: message.role === 'user' ? '#e3f2fd' : '#f1f8e9',
                       border: `1px solid ${message.role === 'user' ? '#90caf9' : '#c5e1a5'}`,
                     }}
                   >
                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                       <strong style={{ color: message.role === 'user' ? '#1976d2' : '#689f38' }}>
                         {message.role === 'user' ? '👤 User' : '🤖 ScavAI'}
                       </strong>
                       <span style={{ fontSize: '12px', color: '#666' }}>
                         {new Date(message.timestamp).toLocaleString()}
                       </span>
                     </div>
                     <p style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                       {message.content}
                     </p>
                   </div>
                 ))}
               </div>
               <div style={{ marginTop: '20px' }}>
                 <button
                   type="button"
                   className="button"
                   onClick={() => setSelectedConversation(null)}
                 >
                   Close
                 </button>
               </div>
             </div>
           </div>
         )}

         {/* New Team Codes Modal */}
         {newTeamCodes && (
           <div className="modal" onClick={() => setNewTeamCodes(null)}>
             <div className="modal-content" onClick={(e) => e.stopPropagation()}>
               <h2 className="modal-title">
                 🎉 New Team Codes Generated
               </h2>
               <p style={{ fontSize: '14px', color: '#d32f2f', marginBottom: '20px', fontWeight: 'bold' }}>
                 ⚠️ IMPORTANT: Save these codes now! They cannot be retrieved later.
               </p>
               <div style={{
                 maxHeight: '50vh',
                 overflowY: 'auto',
                 border: '1px solid #ddd',
                 borderRadius: '8px',
                 padding: '20px',
                 backgroundColor: '#f9f9f9',
                 marginBottom: '20px'
               }}>
                 {newTeamCodes.map((teamCode, index) => (
                   <div
                     key={index}
                     style={{
                       marginBottom: '12px',
                       padding: '12px',
                       borderRadius: '8px',
                       backgroundColor: 'white',
                       border: '1px solid #ddd',
                     }}
                   >
                     <div style={{ marginBottom: '4px', fontWeight: 'bold', fontSize: '16px' }}>
                       {teamCode.emoji} {teamCode.name}
                     </div>
                     <div style={{ 
                       fontFamily: 'monospace', 
                       fontSize: '14px', 
                       color: '#0070f3',
                       wordBreak: 'break-all'
                     }}>
                       {teamCode.teamCode}
                     </div>
                   </div>
                 ))}
               </div>
               <div className="modal-buttons">
                 <button
                   type="button"
                   className="button"
                   onClick={copyTeamCodesToClipboard}
                   style={{ backgroundColor: '#0070f3' }}
                 >
                   📋 Copy All to Clipboard
                 </button>
                 <button
                   type="button"
                   className="button button-secondary"
                   onClick={() => setNewTeamCodes(null)}
                 >
                   Close
                 </button>
               </div>
             </div>
           </div>
         )}
       </div>
     </>
   );
 }
