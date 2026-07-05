import React from 'react';

export function StandingsTable({ rows }) {
  return (
    <table className="data-table standings-table">
      <thead><tr><th></th><th>Franchise</th><th>Cat Record</th><th>GB</th></tr></thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.rank}>
            <td>{row.rank}</td>
            <td>{row.franchise}</td>
            <td className="num">{row.record}</td>
            <td className="num">{row.gb}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function FeedList({ items }) {
  return (
    <div className="feed-list">
      {items.map((item, index) => (
        <div className="feed-item" key={index}>
          <span className="feed-time">{item.time}</span>
          <span className="feed-type">{item.type}</span>
          <span>{item.text}</span>
        </div>
      ))}
    </div>
  );
}
