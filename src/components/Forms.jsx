import React from 'react';

export function Field({ label, value, onChange, type = 'text', placeholder, helper }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {helper && <small>{helper}</small>}
    </label>
  );
}

export function SelectField({ label, value, onChange, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>{children}</select>
    </label>
  );
}

export function PrimaryButton({ children, onClick, disabled = false, type = 'button' }) {
  return <button type={type} className="primary-btn" onClick={onClick} disabled={disabled}>{children}</button>;
}

export function SecondaryButton({ children, onClick, type = 'button' }) {
  return <button type={type} className="secondary-btn" onClick={onClick}>{children}</button>;
}
