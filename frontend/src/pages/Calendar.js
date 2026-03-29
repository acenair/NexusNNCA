import React from 'react';
import { useOutletContext } from 'react-router-dom';

const Calendar = () => {
  const { user } = useOutletContext();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'DM Serif Display' }}>Calendar</h1>
        <p className="text-gray-400 mt-1">Schedule meetings, follow-ups, and track deadlines</p>
      </div>

      <div className="rounded-lg border p-8" style={{ background: '#0f1832', borderColor: 'rgba(255,255,255,0.08)' }}>
        <p className="text-gray-400 text-center">Calendar view will be displayed here</p>
      </div>
    </div>
  );
};

export default Calendar;
