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

export default function AdminPage() {
  const currentTeam = useTeam();
  const router = useRouter();
  const [teams, setTeams] = useState<Team[]>([]);
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

  useEffect(() => {
    if (currentTeam) {
      loadTeams();
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
          margin-bottom: 30px;
          color: #333;
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
        .teams-list {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 15px;
        }
        .team-card {
          background-color: white;
          padding: 15px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .team-name {
          font-size: 18px;
          margin-bottom: 10px;
          color: #333;
        }
        .team-info {
          font-size: 12px;
          color: #666;
          margin-bottom: 5px;
          word-break: break-all;
        }
        .members-list {
          margin-top: 10px;
          font-size: 14px;
        }
        .member {
          padding: 5px 0;
          border-top: 1px solid #eee;
        }
        .form {
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-width: 100%;
        }
        .input, .select {
          padding: 12px;
          font-size: 16px;
          border: 1px solid #ddd;
          border-radius: 4px;
          width: 100%;
          box-sizing: border-box;
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
            margin-bottom: 20px;
          }
          .section {
            padding: 15px;
            margin-bottom: 20px;
          }
          .section-title {
            font-size: 20px;
            margin-bottom: 15px;
          }
          .teams-list {
            grid-template-columns: 1fr;
          }
          .team-card {
            padding: 12px;
          }
          .team-name {
            font-size: 16px;
          }
        }
      `}</style>
      <div className="admin-container">
        <h1 className="title">Admin Panel</h1>

        {/* Teams List */}
        <section className="section">
          <h2 className="section-title">All Teams</h2>
          <div className="teams-list">
            {teams.map((team) => (
              <div key={team._id} className="team-card">
                <h3 className="team-name">
                  {team.emoji} {team.name}
                </h3>
                <p className="team-info">Code: {team.teamCode}</p>
                <p className="team-info">Members: {team.members.length}</p>
                <div className="members-list">
                  {team.members.map((member, idx) => (
                    <div key={idx} className="member">
                      {idx}. {member.firstName} {member.familyName}
                    </div>
                  ))}
                </div>
              </div>
            ))}
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
      </div>
    </>
  );
}
