import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useTeam } from '../components/useTeam';

interface Member {
  firstName: string;
  familyName: string;
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

export default function AdminPage() {
  const currentTeam = useTeam();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'teams' | 'challenges'>('teams');
  const [teams, setTeams] = useState<Team[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
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

  useEffect(() => {
    if (currentTeam) {
      loadTeams();
      loadChallenges();
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
                      <th>Team Code</th>
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
                              {idx + 1}. {member.firstName} {member.familyName}
                            </div>
                          ))}
                        </td>
                        <td style={{ wordBreak: 'break-all', fontSize: '12px' }}>
                          {team.teamCode}
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
                        {member.firstName} {member.familyName}
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
                          <button
                            className="small-button edit-button"
                            onClick={() => setEditingChallenge(challenge)}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
      </div>
    </>
  );
}
