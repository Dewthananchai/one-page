import React, { useState, useEffect, useRef, useCallback } from "react";
import { Plus, Trash2, Camera, Printer, Save, ArrowLeft, FileText, ChevronRight, X, Loader2, ClipboardList, Users, Utensils, MapPin, Calendar, RotateCcw, Image as ImageIcon, User, Settings, Database, AlertTriangle, Check, Download } from "lucide-react";

// PDF libraries - loaded dynamically
let html2canvas = null;
let jsPDF = null;

async function loadPdfLibs() {
  if (html2canvas && jsPDF) return;
  
  // Load html2canvas
  if (!window.html2canvas) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  html2canvas = window.html2canvas;
  
  // Load jsPDF
  if (!window.jspdf) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  jsPDF = window.jspdf.jsPDF;
}

/* ---------- design tokens ----------
  ink navy   #1B2A45
  paper      #F7F5EF
  gold       #B8922F
  slate      #55606E
  seal red   #A6402C
  line       #DCD5C4
------------------------------------- */

const FONT_LINK = "https://fonts.googleapis.com/css2?family=Kanit:wght@500;600;700&family=Sarabun:wght@400;500;600;700&display=swap";

function useFonts() {
  useEffect(() => {
    if (document.getElementById("rp-fonts")) return;
    const link = document.createElement("link");
    link.id = "rp-fonts";
    link.rel = "stylesheet";
    link.href = FONT_LINK;
    document.head.appendChild(link);
  }, []);
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// Convert ISO date (YYYY-MM-DD) to Thai format
function isoToThaiDate(iso) {
  if (!iso || !iso.includes('-')) return iso || '';
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  return `${d} ${months[m - 1]} ${y + 543}`;
}

/* ================= SUPABASE (REST/PostgREST, no SDK needed) =================
   Setup SQL to run once in your Supabase project's SQL editor:

   create table reports (
     id text primary key,
     unit text,
     period text,
     data jsonb not null,
     updated_at timestamptz not null default now()
   );
   alter table reports enable row level security;
   create policy "allow all (anon key)" on reports
     for all using (true) with check (true);

   The policy above allows anyone with the anon key to read/write — fine for an
   internal team tool, but if this ever becomes public-facing, replace it with
   a policy scoped to authenticated users.
================================================================================ */

const CONFIG_KEY = "supabase-config";

async function loadSupabaseConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

async function saveSupabaseConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

function sbHeaders(config, extra = {}) {
  return {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function sbListReports(config) {
  const url = `${config.url}/rest/v1/reports?select=id,unit,period,data,updated_at&order=updated_at.desc`;
  const res = await fetch(url, { headers: sbHeaders(config) });
  if (!res.ok) throw new Error(`โหลดรายการไม่สำเร็จ (${res.status})`);
  const rows = await res.json();
  return rows.map((r) => ({ 
    id: r.id, 
    unit: r.unit, 
    period: r.period, 
    activityTitle: r.data?.activityTitle || '',
    updatedAt: new Date(r.updated_at).getTime() 
  }));
}

async function sbGetReport(config, id) {
  const url = `${config.url}/rest/v1/reports?id=eq.${encodeURIComponent(id)}&select=data`;
  const res = await fetch(url, { headers: sbHeaders(config) });
  if (!res.ok) throw new Error(`โหลดรายงานไม่สำเร็จ (${res.status})`);
  const rows = await res.json();
  return rows.length ? rows[0].data : null;
}

async function sbUpsertReport(config, report) {
  const url = `${config.url}/rest/v1/reports?on_conflict=id`;
  const body = [{
    id: report.id,
    unit: report.unit || null,
    period: report.period || null,
    data: report,
    updated_at: new Date(report.updatedAt || Date.now()).toISOString(),
  }];
  const res = await fetch(url, {
    method: "POST",
    headers: sbHeaders(config, { Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`บันทึกไม่สำเร็จ (${res.status})`);
}

async function sbDeleteReport(config, id) {
  const url = `${config.url}/rest/v1/reports?id=eq.${encodeURIComponent(id)}`;
  const res = await fetch(url, { method: "DELETE", headers: sbHeaders(config) });
  if (!res.ok) throw new Error(`ลบไม่สำเร็จ (${res.status})`);
}

async function sbTestConnection(config) {
  const url = `${config.url}/rest/v1/reports?select=id&limit=1`;
  const res = await fetch(url, { headers: sbHeaders(config) });
  if (!res.ok) {
    if (res.status === 404) throw new Error("เชื่อมต่อได้ แต่ไม่พบตาราง 'reports' — รันคำสั่ง SQL ตั้งค่าตารางก่อน");
    throw new Error(`เชื่อมต่อไม่สำเร็จ (${res.status}) ตรวจสอบ URL และ Anon Key`);
  }
}

/* ================= TEAM FUNCTIONS ================= */
const USER_KEY = "user-name";

function getUserName() {
  return localStorage.getItem(USER_KEY) || '';
}

function setUserName(name) {
  localStorage.setItem(USER_KEY, name);
}

// สร้างทีมใหม่
async function sbCreateTeam(config, name) {
  const userId = getUserName() || uid();
  const teamId = uid();
  
  // สร้างทีม
  const teamUrl = `${config.url}/rest/v1/teams`;
  const teamRes = await fetch(teamUrl, {
    method: 'POST',
    headers: sbHeaders(config, { Prefer: 'return=representation' }),
    body: JSON.stringify({ id: teamId, name, owner_id: userId })
  });
  if (!teamRes.ok) throw new Error('สร้างทีมไม่สำเร็จ');
  
  // เพิ่มตัวเองเป็นสมาชิก
  const memberUrl = `${config.url}/rest/v1/team_members`;
  const memberRes = await fetch(memberUrl, {
    method: 'POST',
    headers: sbHeaders(config),
    body: JSON.stringify({ id: uid(), team_id: teamId, user_name: userId, role: 'owner' })
  });
  if (!memberRes.ok) throw new Error('เพิ่มสมาชิกไม่สำเร็จ');
  
  return { id: teamId, name, owner_id: userId };
}

// ดึงรายการทีมที่เป็นสมาชิก
async function sbListMyTeams(config) {
  const userName = getUserName();
  if (!userName) return [];
  
  const url = `${config.url}/rest/v1/team_members?user_name=eq.${encodeURIComponent(userName)}&select=team_id,role,teams(id,name,owner_id)`;
  const res = await fetch(url, { headers: sbHeaders(config) });
  if (!res.ok) return [];
  const rows = await res.json();
  return rows.map(r => ({ ...r.teams, memberRole: r.role })).filter(t => t.id);
}

// ดึงสมาชิกในทีม
async function sbListTeamMembers(config, teamId) {
  const url = `${config.url}/rest/v1/team_members?team_id=eq.${teamId}&select=id,user_name,role,joined_at`;
  const res = await fetch(url, { headers: sbHeaders(config) });
  if (!res.ok) return [];
  return res.json();
}

// สร้างโค้ดเชิญ
async function sbCreateInvitation(config, teamId) {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const url = `${config.url}/rest/v1/invitations`;
  const res = await fetch(url, {
    method: 'POST',
    headers: sbHeaders(config, { Prefer: 'return=representation' }),
    body: JSON.stringify({
      id: uid(),
      team_id: teamId,
      code,
      created_by: getUserName(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 วัน
    })
  });
  if (!res.ok) throw new Error('สร้างโค้ดเชิญไม่สำเร็จ');
  const rows = await res.json();
  return rows[0];
}

// ใช้โค้ดเชิญเข้าทีม
async function sbJoinWithCode(config, code) {
  const userName = getUserName();
  if (!userName) throw new Error('กรุณาตั้งชื่อก่อน');
  
  // หาโค้ดเชิญ
  const url = `${config.url}/rest/v1/invitations?code=eq.${code}&used=eq.false`;
  const res = await fetch(url, { headers: sbHeaders(config) });
  if (!res.ok) throw new Error('ค้นหาโค้ดเชิญไม่สำเร็จ');
  const rows = await res.json();
  
  if (rows.length === 0) throw new Error('โค้ดเชิญไม่ถูกต้องหรือใช้ไปแล้ว');
  
  const invite = rows[0];
  
  // ตรวจสอบหมดอายุ
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    throw new Error('โค้ดเชิญหมดอายุแล้ว');
  }
  
  // ตรวจสอบว่าเป็นสมาชิกอยู่แล้ว
  const checkUrl = `${config.url}/rest/v1/team_members?team_id=eq.${invite.team_id}&user_name=eq.${userName}`;
  const checkRes = await fetch(checkUrl, { headers: sbHeaders(config) });
  const existing = await checkRes.json();
  if (existing.length > 0) throw new Error('คุณเป็นสมาชิกทีมนี้อยู่แล้ว');
  
  // เข้าร่วมทีม
  const joinUrl = `${config.url}/rest/v1/team_members`;
  const joinRes = await fetch(joinUrl, {
    method: 'POST',
    headers: sbHeaders(config),
    body: JSON.stringify({ id: uid(), team_id: invite.team_id, user_name: userName, role: 'member' })
  });
  if (!joinRes.ok) throw new Error('เข้าร่วมทีมไม่สำเร็จ');
  
  // ทำเครื่องหมายว่าใช้โค้ดแล้ว
  const updateUrl = `${config.url}/rest/v1/invitations?id=eq.${invite.id}`;
  await fetch(updateUrl, {
    method: 'PATCH',
    headers: sbHeaders(config),
    body: JSON.stringify({ used: true })
  });
  
  return invite.team_id;
}

// ลบสมาชิกออกจากทีม
async function sbRemoveMember(config, memberId) {
  const url = `${config.url}/rest/v1/team_members?id=eq.${memberId}`;
  const res = await fetch(url, { method: 'DELETE', headers: sbHeaders(config) });
  if (!res.ok) throw new Error('ลบสมาชิกไม่สำเร็จ');
}

// ลบทีม
async function sbDeleteTeam(config, teamId) {
  const url = `${config.url}/rest/v1/teams?id=eq.${teamId}`;
  const res = await fetch(url, { method: 'DELETE', headers: sbHeaders(config) });
  if (!res.ok) throw new Error('ลบทีมไม่สำเร็จ');
}

/* ================= TEAM MANAGEMENT ================= */
function TeamManagement({ config, onBack }) {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [userName, setUserNameState] = useState(getUserName());
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadTeams();
  }, [config]);

  const loadTeams = async () => {
    setLoading(true);
    try {
      const myTeams = await sbListMyTeams(config);
      setTeams(myTeams);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const loadMembers = async (teamId) => {
    try {
      const m = await sbListTeamMembers(config, teamId);
      setMembers(m);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSetUserName = () => {
    if (!userName.trim()) {
      setError('กรุณากรอกชื่อ');
      return;
    }
    setUserName(userName.trim());
    setSuccess('ตั้งชื่อสำเร็จ');
    setError('');
    setTimeout(() => setSuccess(''), 2000);
  };

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) {
      setError('กรุณากรอกชื่อทีม');
      return;
    }
    if (!getUserName()) {
      setError('กรุณาตั้งชื่อก่อนสร้างทีม');
      return;
    }
    try {
      await sbCreateTeam(config, newTeamName.trim());
      setNewTeamName('');
      setShowCreate(false);
      setSuccess('สร้างทีมสำเร็จ!');
      setError('');
      loadTeams();
      setTimeout(() => setSuccess(''), 2000);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleJoinTeam = async () => {
    if (!joinCode.trim()) {
      setError('กรุณากรอกโค้ดเชิญ');
      return;
    }
    if (!getUserName()) {
      setError('กรุณาตั้งชื่อก่อนเข้าร่วมทีม');
      return;
    }
    try {
      await sbJoinWithCode(config, joinCode.trim().toUpperCase());
      setJoinCode('');
      setShowJoin(false);
      setSuccess('เข้าร่วมทีมสำเร็จ!');
      setError('');
      loadTeams();
      setTimeout(() => setSuccess(''), 2000);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleCreateInvite = async (teamId) => {
    try {
      const invite = await sbCreateInvitation(config, teamId);
      setInvitations([...invitations, invite]);
      setSuccess(`โค้ดเชิญ: ${invite.code}`);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };

  const handleRemoveMember = async (memberId) => {
    if (!confirm('ลบสมาชิกนี้ออกจากทีม?')) return;
    try {
      await sbRemoveMember(config, memberId);
      if (selectedTeam) loadMembers(selectedTeam.id);
      setSuccess('ลบสมาชิกสำเร็จ');
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setSuccess('คัดลอกแล้ว!');
      setTimeout(() => setSuccess(''), 2000);
    });
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F7F5EF', padding: '20px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', padding: 8, cursor: 'pointer' }}>
          <ArrowLeft size={20} color="#1B2A45" />
        </button>
        <div>
          <div style={{ fontFamily: 'Kanit', fontWeight: 700, fontSize: 20, color: '#1B2A45' }}>จัดการทีม</div>
          <div style={{ fontFamily: 'Sarabun', fontSize: 12.5, color: '#55606E' }}>เชิญเพื่อนเข้าร่วมทีมเพื่อทำงานร่วมกัน</div>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: '#FCEEEA', color: '#A6402C', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontFamily: 'Sarabun', fontSize: 13 }}>
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: '#E8F5E9', color: '#2E7D32', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontFamily: 'Sarabun', fontSize: 13 }}>
          <Check size={16} />
          <span>{success}</span>
        </div>
      )}

      {/* User Name Setting */}
      <div style={{ background: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 16, border: '1px solid #E8E2D3' }}>
        <div style={{ fontFamily: 'Kanit', fontWeight: 600, fontSize: 14, color: '#1B2A45', marginBottom: 10 }}>
          <User size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          ชื่อของคุณ (สำหรับระบุตัวตนในทีม)
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={{ ...inputStyle, flex: 1 }}
            value={userName}
            onChange={(e) => setUserNameState(e.target.value)}
            placeholder="กรอกชื่อ-นามสกุล หรือ ชื่อเล่น"
          />
          <button onClick={handleSetUserName} style={{ ...addBtnStyle, background: '#1B2A45', color: '#FFFFFF' }}>
            <Check size={14} /> บันทึก
          </button>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <button onClick={() => { setShowCreate(true); setShowJoin(false); }} style={{ ...addBtnStyle, flex: 1, justifyContent: 'center', background: '#1B2A45', color: '#FFFFFF', padding: '12px' }}>
          <Plus size={16} /> สร้างทีมใหม่
        </button>
        <button onClick={() => { setShowJoin(true); setShowCreate(false); }} style={{ ...addBtnStyle, flex: 1, justifyContent: 'center', background: '#B8922F', color: '#FFFFFF', padding: '12px' }}>
          <Users size={16} /> เข้าร่วมทีม
        </button>
      </div>

      {/* Create Team Form */}
      {showCreate && (
        <div style={{ background: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 16, border: '1px solid #E8E2D3' }}>
          <div style={{ fontFamily: 'Kanit', fontWeight: 600, fontSize: 14, color: '#1B2A45', marginBottom: 10 }}>สร้างทีมใหม่</div>
          <input
            style={inputStyle}
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            placeholder="ชื่อทีม เช่น กลุ่มงานตรวจราชการ"
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={handleCreateTeam} style={{ ...addBtnStyle, flex: 1, justifyContent: 'center', background: '#2E7D32', color: '#FFFFFF' }}>
              <Check size={14} /> สร้างทีม
            </button>
            <button onClick={() => setShowCreate(false)} style={{ ...addBtnStyle, flex: 1, justifyContent: 'center' }}>
              <X size={14} /> ยกเลิก
            </button>
          </div>
        </div>
      )}

      {/* Join Team Form */}
      {showJoin && (
        <div style={{ background: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 16, border: '1px solid #E8E2D3' }}>
          <div style={{ fontFamily: 'Kanit', fontWeight: 600, fontSize: 14, color: '#1B2A45', marginBottom: 10 }}>เข้าร่วมทีมด้วยโค้ดเชิญ</div>
          <input
            style={{ ...inputStyle, textTransform: 'uppercase', letterSpacing: 2, textAlign: 'center', fontSize: 18, fontWeight: 'bold' }}
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="กรอกโค้ด 6 ตัวอักษร"
            maxLength={6}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={handleJoinTeam} style={{ ...addBtnStyle, flex: 1, justifyContent: 'center', background: '#2E7D32', color: '#FFFFFF' }}>
              <Check size={14} /> เข้าร่วม
            </button>
            <button onClick={() => setShowJoin(false)} style={{ ...addBtnStyle, flex: 1, justifyContent: 'center' }}>
              <X size={14} /> ยกเลิก
            </button>
          </div>
        </div>
      )}

      {/* Teams List */}
      <div style={{ fontFamily: 'Kanit', fontWeight: 600, fontSize: 14, color: '#1B2A45', marginBottom: 10 }}>
        ทีมของฉัน ({teams.length})
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
          <Loader2 className="spin" size={24} color="#B8922F" />
        </div>
      ) : teams.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '30px 20px', background: '#FFFFFF', borderRadius: 12, border: '1px dashed #DCD5C4' }}>
          <Users size={30} color="#B8922F" style={{ marginBottom: 10 }} />
          <div style={{ fontFamily: 'Kanit', fontWeight: 600, color: '#1B2A45', fontSize: 14 }}>ยังไม่มีทีม</div>
          <div style={{ fontFamily: 'Sarabun', fontSize: 12.5, color: '#55606E', marginTop: 4 }}>
            สร้างทีมใหม่หรือใช้โค้ดเชิญจากเพื่อน
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {teams.map((team) => (
            <div key={team.id} style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E8E2D3', overflow: 'hidden' }}>
              <div
                style={{ padding: '14px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                onClick={() => {
                  if (selectedTeam?.id === team.id) {
                    setSelectedTeam(null);
                  } else {
                    setSelectedTeam(team);
                    loadMembers(team.id);
                  }
                }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 10, background: team.memberRole === 'owner' ? '#1B2A45' : '#B8922F', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Users size={18} color="#FFFFFF" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'Kanit', fontWeight: 600, fontSize: 15, color: '#1B2A45' }}>{team.name}</div>
                  <div style={{ fontFamily: 'Sarabun', fontSize: 12, color: '#55606E' }}>
                    {team.memberRole === 'owner' ? '👑 เจ้าของทีม' : '👤 สมาชิก'}
                  </div>
                </div>
                <ChevronRight size={18} color="#B8B2A0" style={{ transform: selectedTeam?.id === team.id ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
              </div>

              {/* Team Details */}
              {selectedTeam?.id === team.id && (
                <div style={{ padding: '0 14px 14px', borderTop: '1px solid #E8E2D3' }}>
                  {/* Invite Button */}
                  {team.memberRole === 'owner' && (
                    <button onClick={() => handleCreateInvite(team.id)} style={{ ...addBtnStyle, width: '100%', justifyContent: 'center', marginTop: 12, background: '#E8F5E9', color: '#2E7D32' }}>
                      <Plus size={14} /> สร้างโค้ดเชิญ
                    </button>
                  )}

                  {/* Members List */}
                  <div style={{ fontFamily: 'Kanit', fontWeight: 600, fontSize: 13, color: '#1B2A45', marginTop: 12, marginBottom: 8 }}>
                    สมาชิก ({members.length})
                  </div>
                  {members.map((m) => (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #F0EBDD' }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: m.role === 'owner' ? '#1B2A45' : '#E8E2D3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <User size={14} color={m.role === 'owner' ? '#FFFFFF' : '#55606E'} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: 'Sarabun', fontSize: 13, fontWeight: 500, color: '#1B2A45' }}>{m.user_name}</div>
                        <div style={{ fontFamily: 'Sarabun', fontSize: 11, color: '#55606E' }}>{m.role === 'owner' ? '👑 เจ้าของทีม' : '👤 สมาชิก'}</div>
                      </div>
                      {team.memberRole === 'owner' && m.role !== 'owner' && (
                        <button onClick={() => handleRemoveMember(m.id)} style={{ background: 'none', border: 'none', color: '#A6402C', cursor: 'pointer', padding: 4 }}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* How to Use */}
      <div style={{ background: '#FFFFFF', borderRadius: 12, padding: 16, marginTop: 20, border: '1px solid #E8E2D3' }}>
        <div style={{ fontFamily: 'Kanit', fontWeight: 600, fontSize: 14, color: '#1B2A45', marginBottom: 10 }}>วิธีใช้งาน</div>
        <div style={{ fontFamily: 'Sarabun', fontSize: 12.5, color: '#55606E', lineHeight: 1.8 }}>
          <div>1. <strong>ตั้งชื่อ</strong>ของคุณด้านบน</div>
          <div>2. <strong>สร้างทีมใหม่</strong> หรือ <strong>เข้าร่วมทีม</strong> ด้วยโค้ดเชิญ</div>
          <div>3. <strong>สร้างโค้ดเชิญ</strong>แล้วส่งให้เพื่อน</div>
          <div>4. เพื่อนนำโค้ดไปกรอกในช่อง <strong>เข้าร่วมทีม</strong></div>
        </div>
      </div>
    </div>
  );
}

const emptyReport = () => ({
  id: uid(),
  unit: "",
  activityTitle: "",
  reporter: "",
  reporterRole: "",
  period: "",
  location: "",
  logo: null,
  signature: null,
  summaryText: "",
  kpis: [],
  highlights: [""],
  orders: [""],
  nextPlan: "",
  quote: "",
  photos: {
    featured: [],
    inspect: [],
    meeting: [],
    relation: [],
  },
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const CATEGORY_META = {
  inspect: { title: "ตรวจเยี่ยม / ติดตามงาน สภ.", icon: ClipboardList, color: "#1B2A45" },
  meeting: { title: "ประชุม / สั่งการงาน", icon: Users, color: "#B8922F" },
  relation: { title: "กิจกรรมเชื่อมความสัมพันธ์", icon: Utensils, color: "#A6402C" },
};
const GALLERY_KEYS = Object.keys(CATEGORY_META);

async function resizeImage(file, maxW = 1400, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}





/* ================= SUPABASE SETUP SCREEN ================= */
function SupabaseSetup({ initial, onSaved }) {
  const [url, setUrl] = useState(initial?.url || "");
  const [key, setKey] = useState(initial?.key || "");
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [showSql, setShowSql] = useState(false);

  const SQL = `-- ตารางรายงาน
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  unit TEXT,
  period TEXT,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ตารางทีม
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ตารางสมาชิกทีม
CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ตารางคำเชิญ
CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS policies
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow all reports" ON reports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow all teams" ON teams FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow all members" ON team_members FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow all invitations" ON invitations FOR ALL USING (true) WITH CHECK (true);`;

  const handleConnect = async () => {
    setError("");
    const cleanUrl = url.trim().replace(/\/$/, "");
    if (!cleanUrl || !key.trim()) { setError("กรุณากรอก Project URL และ Anon Key ให้ครบ"); return; }
    setTesting(true);
    try {
      const cfg = { url: cleanUrl, key: key.trim() };
      await sbTestConnection(cfg);
      await saveSupabaseConfig(cfg);
      onSaved(cfg);
    } catch (e) {
      setError(e.message || "เชื่อมต่อไม่สำเร็จ");
    }
    setTesting(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ maxWidth: 420, width: "100%", background: "#FFFFFF", border: "1px solid #E8E2D3", borderRadius: 16, padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Database size={20} color="#1B2A45" />
          <div style={{ fontFamily: "Kanit", fontWeight: 700, fontSize: 17, color: "#1B2A45" }}>เชื่อมต่อฐานข้อมูล Supabase</div>
        </div>
        <div style={{ fontFamily: "Sarabun", fontSize: 12.5, color: "#55606E", marginBottom: 16, lineHeight: 1.5 }}>
          ตั้งค่าครั้งเดียว ทีมทุกคนที่เปิดระบบนี้จะใช้ฐานข้อมูลเดียวกัน
        </div>

        <Field label="Project URL">
          <input style={inputStyle} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxxxxxx.supabase.co" />
        </Field>
        <Field label="Anon / Public API Key">
          <input style={inputStyle} value={key} onChange={(e) => setKey(e.target.value)} placeholder="eyJhbGciOi..." />
        </Field>

        <div style={{ fontFamily: "Sarabun", fontSize: 11.5, color: "#8A6D1E", marginBottom: 10 }}>
          หาได้จาก Supabase Dashboard → Project Settings → API
        </div>

        <button onClick={() => setShowSql((s) => !s)} style={{ ...addBtnStyle, marginBottom: 10 }}>
          {showSql ? "ซ่อนคำสั่ง SQL ตั้งค่าตาราง" : "ยังไม่ได้สร้างตาราง? ดูคำสั่ง SQL"}
        </button>
        {showSql && (
          <div style={{ background: "#1B2A45", borderRadius: 8, padding: 12, marginBottom: 12, overflowX: "auto" }}>
            <pre style={{ margin: 0, color: "#EDE9D8", fontSize: 10.5, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>{SQL}</pre>
            <div style={{ fontFamily: "Sarabun", fontSize: 10.5, color: "#D7CBA5", marginTop: 6 }}>
              วางและรันใน Supabase → SQL Editor ก่อนกดเชื่อมต่อ
            </div>
          </div>
        )}

        {error && (
          <div style={{ display: "flex", gap: 6, alignItems: "flex-start", background: "#FCEEEA", color: "#A6402C", borderRadius: 8, padding: "8px 10px", marginBottom: 12, fontFamily: "Sarabun", fontSize: 12 }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        <button onClick={handleConnect} disabled={testing} style={{ ...printBtnStyle, marginTop: 0, opacity: testing ? 0.7 : 1 }}>
          {testing ? <Loader2 size={16} className="spin" /> : <Check size={16} />} {testing ? "กำลังทดสอบการเชื่อมต่อ..." : "เชื่อมต่อ"}
        </button>
      </div>
    </div>
  );
}

/* ================= LIST VIEW ================= */
function ListView({ reports, onOpen, onNew, onDelete, loading, onOpenSettings, onOpenTeam, error }) {
  return (
    <div style={{ padding: "20px 16px 90px" }}>
      <div style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: "Kanit", fontWeight: 700, fontSize: 22, color: "#1B2A45", letterSpacing: 0.2 }}>
            ระบบรายงานผลการปฏิบัติงาน
          </div>
          <div style={{ fontFamily: "Sarabun", fontSize: 13.5, color: "#55606E", marginTop: 3 }}>
            บันทึกผลงาน สรุปเป็นรายงาน one-page พร้อมใช้ทุกครั้งที่ต้องส่งงาน
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={onOpenTeam} style={{ background: "none", border: "none", padding: 8, cursor: "pointer", flexShrink: 0 }} aria-label="จัดการทีม">
            <Users size={19} color="#1B2A45" />
          </button>
          <button onClick={onOpenSettings} style={{ background: "none", border: "none", padding: 8, cursor: "pointer", flexShrink: 0 }} aria-label="ตั้งค่าฐานข้อมูล">
            <Settings size={19} color="#55606E" />
          </button>
        </div>
      </div>

      {error && (
        <div style={{ display: "flex", gap: 6, alignItems: "flex-start", background: "#FCEEEA", color: "#A6402C", borderRadius: 8, padding: "9px 11px", marginBottom: 14, fontFamily: "Sarabun", fontSize: 12.5 }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 40, color: "#B8922F" }}>
          <Loader2 className="spin" size={26} />
        </div>
      ) : reports.length === 0 ? (
        <div style={emptyStateStyle}>
          <FileText size={30} color="#B8922F" style={{ marginBottom: 10 }} />
          <div style={{ fontFamily: "Kanit", fontWeight: 600, color: "#1B2A45", fontSize: 15 }}>ยังไม่มีรายงาน</div>
          <div style={{ fontFamily: "Sarabun", fontSize: 13, color: "#55606E", marginTop: 4 }}>
            แตะปุ่ม + เพื่อเริ่มสร้างรายงานฉบับแรก
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {reports.map((r) => (
            <div key={r.id} style={cardStyle} onClick={() => onOpen(r.id)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "Kanit", fontWeight: 600, fontSize: 15, color: "#1B2A45", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.period ? isoToThaiDate(r.period) : "ไม่ระบุวันที่"}
                </div>
                {r.activityTitle && (
                  <div style={{ fontFamily: "Sarabun", fontSize: 12, color: "#1B2A45", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>
                    {r.activityTitle}
                  </div>
                )}
                <div style={{ fontFamily: "Sarabun", fontSize: 12.5, color: "#55606E", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.unit || "ไม่ระบุหน่วยงาน"}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(r.id); }}
                style={{ background: "none", border: "none", padding: 8, color: "#A6402C", cursor: "pointer", flexShrink: 0 }}
                aria-label="ลบรายงาน"
              >
                <Trash2 size={17} />
              </button>
              <ChevronRight size={18} color="#B8B2A0" style={{ flexShrink: 0 }} />
            </div>
          ))}
        </div>
      )}

      <button style={fabStyle} onClick={onNew} aria-label="สร้างรายงานใหม่">
        <Plus size={24} color="#F7F5EF" />
      </button>
    </div>
  );
}

const emptyStateStyle = {
  textAlign: "center",
  padding: "48px 20px",
  border: "1.5px dashed #DCD5C4",
  borderRadius: 14,
  background: "#FFFFFF",
};

const cardStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  background: "#FFFFFF",
  border: "1px solid #E8E2D3",
  borderRadius: 12,
  padding: "13px 12px",
  cursor: "pointer",
  boxShadow: "0 1px 2px rgba(27,42,69,0.04)",
};

const fabStyle = {
  position: "fixed",
  bottom: 22,
  right: 20,
  width: 54,
  height: 54,
  borderRadius: "50%",
  background: "#1B2A45",
  border: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  boxShadow: "0 4px 14px rgba(27,42,69,0.35)",
};

/* ================= EDITOR VIEW ================= */
function EditorView({ report, onChange, onBack, onSave, onPrint, saving }) {
  const [tab, setTab] = useState("form"); // form | preview
  const fileInputs = useRef({});
  const logoInput = useRef(null);
  const signatureInput = useRef(null);

  const set = (patch) => onChange({ ...report, ...patch, updatedAt: Date.now() });

  const updateKpi = (id, field, val) => {
    set({ kpis: report.kpis.map((k) => (k.id === id ? { ...k, [field]: val } : k)) });
  };
  const addKpi = () => {
    if (report.kpis.length >= 6) return;
    set({ kpis: [...report.kpis, { id: uid(), label: "", value: "" }] });
  };
  const removeKpi = (id) => set({ kpis: report.kpis.filter((k) => k.id !== id) });

  const updateHighlight = (i, val) => {
    const hl = [...report.highlights];
    hl[i] = val;
    set({ highlights: hl });
  };
  const addHighlight = () => {
    if (report.highlights.length >= 8) return;
    set({ highlights: [...report.highlights, ""] });
  };
  const removeHighlight = (i) => set({ highlights: report.highlights.filter((_, idx) => idx !== i) });

  const updateOrder = (i, val) => {
    const o = [...report.orders];
    o[i] = val;
    set({ orders: o });
  };
  const addOrder = () => {
    if (report.orders.length >= 6) return;
    set({ orders: [...report.orders, ""] });
  };
  const removeOrder = (i) => set({ orders: report.orders.filter((_, idx) => idx !== i) });

  const handleLogoUpload = async (files) => {
    if (!files?.length) return;
    try {
      const dataUrl = await resizeImage(files[0], 400, 0.9);
      set({ logo: dataUrl });
    } catch (e) { /* ignore */ }
  };

  const handleSignatureUpload = async (files) => {
    if (!files?.length) return;
    try {
      const dataUrl = await resizeImage(files[0], 500, 0.92);
      set({ signature: dataUrl });
    } catch (e) { /* ignore */ }
  };

  const [exportingPdf, setExportingPdf] = useState(false);

  const exportPdf = async () => {
    setExportingPdf(true);
    try {
      await loadPdfLibs();
      
      const element = document.getElementById('one-page-report');
      if (!element) {
        alert('ไม่พบรายงาน กรุณาเปิดแท็บตัวอย่างก่อน');
        return;
      }

      // Store original styles
      const origOverflow = element.style.overflow;
      const origHeight = element.style.height;
      const origWidth = element.style.width;
      const origMinHeight = element.style.minHeight;
      const origAspect = element.style.aspectRatio;
      
      // A4 dimensions: 210mm x 297mm = 794px x 1123px at 96 DPI
      const a4WidthPx = 794;
      const a4HeightPx = 1123;
      
      // Temporarily expand for capture
      element.style.overflow = 'visible';
      element.style.width = a4WidthPx + 'px';
      element.style.minHeight = a4HeightPx + 'px';
      element.style.height = 'auto';
      element.style.aspectRatio = 'auto';

      const canvas = await html2canvas(element, {
        scale: 3,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#FFFFFF',
        logging: false,
        width: a4WidthPx,
        height: Math.max(element.scrollHeight, a4HeightPx),
      });

      // Restore original styles
      element.style.overflow = origOverflow;
      element.style.height = origHeight;
      element.style.width = origWidth;
      element.style.minHeight = origMinHeight;
      element.style.aspectRatio = origAspect;

      // A4 size in mm
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const imgWidth = pdfWidth - 10; // 5mm margin each side
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      
      // If image is taller than one page, split it
      if (imgHeight <= pdfHeight - 10) {
        pdf.addImage(imgData, 'JPEG', 5, 5, imgWidth, imgHeight);
      } else {
        // Multi-page support
        let heightLeft = imgHeight;
        let position = 5;
        
        pdf.addImage(imgData, 'JPEG', 5, position, imgWidth, imgHeight);
        heightLeft -= (pdfHeight - 10);
        
        while (heightLeft > 0) {
          position = -(pdfHeight - 10) + 5;
          pdf.addPage();
          pdf.addImage(imgData, 'JPEG', 5, position, imgWidth, imgHeight);
          heightLeft -= (pdfHeight - 10);
        }
      }

      // Generate filename from report data
      const fileName = report.period 
        ? `รายงาน_${report.period.replace(/[^a-zA-Z0-9ก-๙]/g, '_')}.pdf`
        : `รายงาน_${new Date().toISOString().slice(0,10)}.pdf`;
      
      pdf.save(fileName);
    } catch (err) {
      console.error('PDF export error:', err);
      alert('เกิดข้อผิดพลาดในการสร้าง PDF: ' + err.message);
    }
    setExportingPdf(false);
  };

  const [exportingImg, setExportingImg] = useState(false);

  const exportImage = async () => {
    setExportingImg(true);
    try {
      await loadPdfLibs();
      
      const element = document.getElementById('one-page-report');
      if (!element) {
        alert('ไม่พบรายงาน กรุณาเปิดแท็บตัวอย่างก่อน');
        return;
      }

      // Store original styles
      const origOverflow = element.style.overflow;
      const origHeight = element.style.height;
      const origWidth = element.style.width;
      const origMinHeight = element.style.minHeight;
      const origAspect = element.style.aspectRatio;
      
      // A4 dimensions: 210mm x 297mm
      // At 96 DPI: 210mm = 794px, 297mm = 1123px
      const a4WidthPx = 794;
      const a4HeightPx = 1123;
      
      // Temporarily expand for capture
      element.style.overflow = 'visible';
      element.style.width = a4WidthPx + 'px';
      element.style.minHeight = a4HeightPx + 'px';
      element.style.height = 'auto';
      element.style.aspectRatio = 'auto';

      const canvas = await html2canvas(element, {
        scale: 3,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#FFFFFF',
        logging: false,
        width: a4WidthPx,
        height: Math.max(element.scrollHeight, a4HeightPx),
      });

      // Restore original styles
      element.style.overflow = origOverflow;
      element.style.height = origHeight;
      element.style.width = origWidth;
      element.style.minHeight = origMinHeight;
      element.style.aspectRatio = origAspect;

      // Convert to blob and download
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = report.period 
          ? `รายงาน_${report.period.replace(/[^a-zA-Z0-9ก-๙]/g, '_')}.png`
          : `รายงาน_${new Date().toISOString().slice(0,10)}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 'image/png', 1.0);
    } catch (err) {
      console.error('Image export error:', err);
      alert('เกิดข้อผิดพลาดในการสร้างรูปภาพ: ' + err.message);
    }
    setExportingImg(false);
  };

  const handlePhotoUpload = async (cat, files) => {
    const max = cat === "featured" ? 5 : 10;
    const arr = Array.from(files).slice(0, max - report.photos[cat].length);
    const newItems = [];
    for (const f of arr) {
      try {
        const dataUrl = await resizeImage(f, 1400, 0.85);
        newItems.push({ id: uid(), src: dataUrl, caption: "", date: "", location: "" });
      } catch (e) { /* skip failed image */ }
    }
    set({ photos: { ...report.photos, [cat]: [...report.photos[cat], ...newItems] } });
  };

  const updatePhotoField = (cat, id, field, val) => {
    set({ photos: { ...report.photos, [cat]: report.photos[cat].map((p) => (p.id === id ? { ...p, [field]: val } : p)) } });
  };
  const removePhoto = (cat, id) => {
    set({ photos: { ...report.photos, [cat]: report.photos[cat].filter((p) => p.id !== id) } });
  };

  const renderPhotoGrid = (key, maxCount) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
      {report.photos[key].map((p) => (
        <div key={p.id} style={photoThumbWrap}>
          <img src={p.src} alt="" style={photoThumbImg} />
          <input value={p.caption} onChange={(e) => updatePhotoField(key, p.id, "caption", e.target.value)} placeholder="คำบรรยายภาพ" style={captionInputStyle} />
          <input type="date" value={p.date || ""} onChange={(e) => updatePhotoField(key, p.id, "date", e.target.value)} style={captionInputStyle} />
          <input value={p.location || ""} onChange={(e) => updatePhotoField(key, p.id, "location", e.target.value)} placeholder="สถานที่" style={captionInputStyle} />
          <button onClick={() => removePhoto(key, p.id)} style={photoDeleteBtn}><X size={12} color="#fff" /></button>
        </div>
      ))}
      {report.photos[key].length < maxCount && (
        <button onClick={() => fileInputs.current[key]?.click()} style={addPhotoBtn}>
          <Camera size={18} color="#B8922F" />
          <span style={{ fontFamily: "Sarabun", fontSize: 11, color: "#B8922F", marginTop: 3 }}>เพิ่มรูป</span>
        </button>
      )}
      <input
        ref={(el) => (fileInputs.current[key] = el)}
        type="file" accept="image/*" multiple style={{ display: "none" }}
        onChange={(e) => { if (e.target.files?.length) handlePhotoUpload(key, e.target.files); e.target.value = ""; }}
      />
    </div>
  );

  return (
    <div style={{ paddingBottom: 90 }}>
      {/* top bar */}
      <div style={topBarStyle}>
        <button onClick={onBack} style={iconBtnStyle} aria-label="กลับ"><ArrowLeft size={20} color="#1B2A45" /></button>
        <div style={{ flex: 1, textAlign: "center", fontFamily: "Kanit", fontWeight: 600, fontSize: 15, color: "#1B2A45" }}>
          {tab === "form" ? "แก้ไขรายงาน" : "ตัวอย่างรายงาน"}
        </div>
        <button onClick={onSave} style={iconBtnStyle} aria-label="บันทึก">
          {saving ? <Loader2 size={19} className="spin" color="#1B2A45" /> : <Save size={19} color="#1B2A45" />}
        </button>
      </div>

      {/* tabs */}
      <div style={tabRowStyle}>
        <button style={tabBtnStyle(tab === "form")} onClick={() => setTab("form")}>กรอกข้อมูล</button>
        <button style={tabBtnStyle(tab === "preview")} onClick={() => setTab("preview")}>ตัวอย่าง One-Page</button>
      </div>

      {tab === "form" ? (
        <div style={{ padding: "16px 16px 0" }}>
          <Section title="ข้อมูลหัวรายงาน">
            <Field label="ตราสัญลักษณ์ / โลโก้หน่วยงาน">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {report.logo ? (
                  <img src={report.logo} alt="logo" style={{ width: 46, height: 46, borderRadius: 8, objectFit: "contain", border: "none", background: "transparent" }} />
                ) : (
                  <div style={{ width: 46, height: 46, borderRadius: 8, background: "#F0EBDD", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <ImageIcon size={18} color="#B8922F" />
                  </div>
                )}
                <button onClick={() => logoInput.current?.click()} style={addBtnStyle}>{report.logo ? "เปลี่ยนโลโก้" : "อัปโหลดโลโก้"}</button>
                {report.logo && <button onClick={() => set({ logo: null })} style={smallDangerBtn}><X size={15} /></button>}
                <input ref={logoInput} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { handleLogoUpload(e.target.files); e.target.value = ""; }} />
              </div>
            </Field>
            <Field label="ลายเซ็นผู้รายงาน">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {report.signature ? (
                  <img src={report.signature} alt="signature" style={{ height: 40, objectFit: "contain", border: "none", borderRadius: 6, padding: 4, background: "transparent", mixBlendMode: "screen" }} />
                ) : (
                  <div style={{ height: 40, width: 80, borderRadius: 6, background: "#F0EBDD", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <ImageIcon size={16} color="#B8922F" />
                  </div>
                )}
                <button onClick={() => signatureInput.current?.click()} style={addBtnStyle}>{report.signature ? "เปลี่ยนลายเซ็น" : "อัปโหลดลายเซ็น"}</button>
                {report.signature && <button onClick={() => set({ signature: null })} style={smallDangerBtn}><X size={15} /></button>}
                <input ref={signatureInput} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { handleSignatureUpload(e.target.files); e.target.value = ""; }} />
              </div>
            </Field>
            <Field label="หน่วยงาน">
              <input style={inputStyle} value={report.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="เช่น ตำรวจภูธรภาค 5" />
            </Field>
            <Field label="ชื่อกิจกรรม / หัวข้อรายงาน">
              <input style={inputStyle} value={report.activityTitle} onChange={(e) => set({ activityTitle: e.target.value })} placeholder="เช่น การตรวจติดตามและประสานงานสถานีตำรวจภูธรในสังกัด" />
            </Field>
            <div style={{ display: "flex", gap: 8 }}>
              <Field label="วันที่">
                <input type="date" style={inputStyle} value={report.period || ''} onChange={(e) => set({ period: e.target.value })} />
              </Field>
              <Field label="สถานที่">
                <input style={inputStyle} value={report.location} onChange={(e) => set({ location: e.target.value })} placeholder="เช่น สภ.เมืองเชียงราย จว.เชียงราย" />
              </Field>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Field label="ผู้รายงาน">
                <input style={inputStyle} value={report.reporter} onChange={(e) => set({ reporter: e.target.value })} placeholder="ยศ-ชื่อ ผู้รายงาน" />
              </Field>
              <Field label="ตำแหน่ง">
                <input style={inputStyle} value={report.reporterRole} onChange={(e) => set({ reporterRole: e.target.value })} placeholder="เช่น ผกก.กลุ่มงานตรวจราชการ" />
              </Field>
            </div>
          </Section>

          <Section title="สรุปผลการปฏิบัติงาน">
            <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} value={report.summaryText} onChange={(e) => set({ summaryText: e.target.value })} placeholder="สรุปเนื้อหาภาพรวมของการปฏิบัติงานในรูปแบบย่อหน้า" />
          </Section>

          <Section title="ผลการดำเนินงาน (แสดงเป็นรายการ)">
            {report.highlights.map((h, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
                <span style={{ fontFamily: "Sarabun", color: "#B8922F", fontWeight: 700, marginTop: 10 }}>{i + 1}.</span>
                <textarea style={{ ...inputStyle, flex: 1, minHeight: 40, resize: "vertical" }} value={h} onChange={(e) => updateHighlight(i, e.target.value)} placeholder="เช่น ตรวจติดตามการปฏิบัติงานของ สภ. ครบถ้วนตามภารกิจ" />
                <button onClick={() => removeHighlight(i)} style={smallDangerBtn}><X size={15} /></button>
              </div>
            ))}
            {report.highlights.length < 8 && <button onClick={addHighlight} style={addBtnStyle}><Plus size={14} /> เพิ่มรายการ</button>}
          </Section>

          <Section title="ตัวชี้วัด (ถ้ามี)">
            {report.kpis.map((k) => (
              <div key={k.id} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                <input style={{ ...inputStyle, flex: 1.3 }} value={k.label} onChange={(e) => updateKpi(k.id, "label", e.target.value)} placeholder="หัวข้อ เช่น จำนวนครั้งตรวจ สภ." />
                <input style={{ ...inputStyle, flex: 0.7 }} value={k.value} onChange={(e) => updateKpi(k.id, "value", e.target.value)} placeholder="ค่า เช่น 12 ครั้ง" />
                <button onClick={() => removeKpi(k.id)} style={smallDangerBtn}><X size={15} /></button>
              </div>
            ))}
            {report.kpis.length < 6 && <button onClick={addKpi} style={addBtnStyle}><Plus size={14} /> เพิ่มตัวชี้วัด</button>}
          </Section>

          <Section title="ภาพกิจกรรมหลัก (แถบหมายเลขด้านบนรายงาน สูงสุด 5 ภาพ)">
            {renderPhotoGrid("featured", 5)}
          </Section>

          <Section title="ภาพการปฏิบัติงานและการประสานงาน">
            {GALLERY_KEYS.map((key) => {
              const meta = CATEGORY_META[key];
              const Icon = meta.icon;
              return (
                <div key={key} style={{ marginBottom: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                    <Icon size={15} color={meta.color} />
                    <span style={{ fontFamily: "Sarabun", fontWeight: 600, fontSize: 13.5, color: "#1B2A45" }}>{meta.title}</span>
                  </div>
                  {renderPhotoGrid(key, 6)}
                </div>
              );
            })}
          </Section>

          <Section title="ข้อสั่งการ / แนวทางการปฏิบัติ">
            {report.orders.map((o, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
                <span style={{ fontFamily: "Sarabun", color: "#B8922F", fontWeight: 700, marginTop: 10 }}>•</span>
                <textarea style={{ ...inputStyle, flex: 1, minHeight: 36, resize: "vertical" }} value={o} onChange={(e) => updateOrder(i, e.target.value)} placeholder="เช่น ให้ปฏิบัติหน้าที่ด้วยความซื่อสัตย์ สุจริต" />
                <button onClick={() => removeOrder(i)} style={smallDangerBtn}><X size={15} /></button>
              </div>
            ))}
            {report.orders.length < 6 && <button onClick={addOrder} style={addBtnStyle}><Plus size={14} /> เพิ่มข้อสั่งการ</button>}
          </Section>

          <Section title="แผนงานถัดไป">
            <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={report.nextPlan} onChange={(e) => set({ nextPlan: e.target.value })} placeholder="สิ่งที่จะดำเนินการต่อในช่วงถัดไป (ถ้ามี)" />
          </Section>

          <Section title="ข้อความปิดท้าย (แถบด้านล่างรายงาน)">
            <input style={inputStyle} value={report.quote} onChange={(e) => set({ quote: e.target.value })} placeholder='เช่น "เป็นตำรวจมืออาชีพ เพื่อความผาสุกของประชาชน"' />
          </Section>
        </div>
      ) : (
        <PreviewPage report={report} onPrint={onPrint} onExportPdf={exportPdf} exportingPdf={exportingPdf} onExportImage={exportImage} exportingImg={exportingImg} />
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={sectionTitleStyle}>{title}</div>
      {children}
    </div>
  );
}
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10, flex: 1 }}>
      <div style={fieldLabelStyle}>{label}</div>
      {children}
    </div>
  );
}

const topBarStyle = {
  position: "sticky", top: 0, zIndex: 20, background: "#F7F5EF",
  display: "flex", alignItems: "center", padding: "10px 6px",
  borderBottom: "1px solid #E8E2D3",
};
const iconBtnStyle = { background: "none", border: "none", padding: 8, cursor: "pointer", display: "flex" };
const tabRowStyle = { display: "flex", gap: 0, padding: "10px 16px 0", borderBottom: "1px solid #E8E2D3" };
const tabBtnStyle = (active) => ({
  flex: 1, padding: "9px 0", background: "none", border: "none",
  fontFamily: "Sarabun", fontWeight: 600, fontSize: 13.5,
  color: active ? "#1B2A45" : "#9CA3AF",
  borderBottom: active ? "2.5px solid #B8922F" : "2.5px solid transparent",
  cursor: "pointer",
});
const sectionTitleStyle = {
  fontFamily: "Kanit", fontWeight: 600, fontSize: 14.5, color: "#1B2A45",
  marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid #E8E2D3",
};
const fieldLabelStyle = { fontFamily: "Sarabun", fontSize: 12.5, color: "#55606E", marginBottom: 4 };
const inputStyle = {
  width: "100%", boxSizing: "border-box", padding: "9px 11px",
  borderRadius: 9, border: "1px solid #DCD5C4", background: "#FFFFFF",
  fontFamily: "Sarabun", fontSize: 14, color: "#1B2A45", outline: "none",
};
const addBtnStyle = {
  display: "inline-flex", alignItems: "center", gap: 5, background: "#EFE9D8",
  border: "none", borderRadius: 8, padding: "7px 12px", fontFamily: "Sarabun",
  fontSize: 12.5, color: "#8A6D1E", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
};
const smallDangerBtn = {
  background: "none", border: "none", color: "#A6402C", cursor: "pointer",
  padding: 8, flexShrink: 0, marginTop: 2,
};
const photoThumbWrap = { position: "relative", display: "flex", flexDirection: "column", gap: 4 };
const photoThumbImg = { width: "100%", height: 68, objectFit: "cover", borderRadius: 8, border: "1px solid #E8E2D3" };
const captionInputStyle = {
  width: "100%", boxSizing: "border-box", padding: "5px 6px", fontSize: 10.5,
  fontFamily: "Sarabun", border: "1px solid #E8E2D3", borderRadius: 6, outline: "none",
};
const photoDeleteBtn = {
  position: "absolute", top: 3, right: 3, width: 18, height: 18, borderRadius: "50%",
  background: "rgba(166,64,44,0.85)", border: "none", display: "flex",
  alignItems: "center", justifyContent: "center", cursor: "pointer",
};
const addPhotoBtn = {
  height: 68, borderRadius: 8, border: "1.5px dashed #D8CBA0", background: "#FBF9F3",
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  cursor: "pointer",
};

/* ---------- Preview (the actual one-page report) ---------- */
function PreviewPage({ report, onPrint, onExportPdf, exportingPdf, onExportImage, exportingImg }) {
  const featuredPhotos = report.photos.featured;
  const galleryPhotos = GALLERY_KEYS.flatMap((k) => report.photos[k].map((p) => ({ ...p, cat: k })));

  const totalPhotoCount = GALLERY_KEYS.reduce((sum, k) => sum + report.photos[k].length, 0) + report.photos.featured.length;
  const orders = report.orders.filter((o) => o);
  const highlights = report.highlights.filter((h) => h);

  return (
    <div style={{ padding: "16px 12px 30px", background: "#EDE9DD" }}>
      <div id="one-page-report" style={pageStyle}>
        {/* ===== HEADER ===== */}
        <div style={headerBarStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {report.logo ? (
              <img src={report.logo} alt="logo" style={{ ...headerLogoStyle, background: "transparent", mixBlendMode: "screen" }} />
            ) : (
              <div style={{ ...headerLogoStyle, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent" }}>
                <ImageIcon size={36} color="#B8922F" />
              </div>
            )}
            <div>
              <div style={{ fontFamily: "Kanit", fontWeight: 700, fontSize: 24, color: "#FFFFFF", lineHeight: 1.2, textShadow: "1px 1px 2px rgba(0,0,0,0.2)" }}>รายงานผลการปฏิบัติงาน</div>
              {report.activityTitle && (
                <div style={{ fontFamily: "Sarabun", fontSize: 14, color: "#D7CBA5", marginTop: 5, lineHeight: 1.4, maxWidth: 280 }}>{report.activityTitle}</div>
              )}
            </div>
          </div>
          <div style={headerInfoBoxStyle}>
            <div style={headerInfoRow}><Calendar size={14} color="#B8922F" /> <span>{report.period ? `วันที่ ${isoToThaiDate(report.period)}` : "วันที่ —"}</span></div>
            <div style={headerInfoRow}><MapPin size={14} color="#B8922F" /> <span>{report.location ? `สถานที่ : ${report.location}` : "สถานที่ —"}</span></div>
            <div style={headerInfoRow}><User size={14} color="#B8922F" /> <span>{report.reporter ? `ผู้รายงาน : ${report.reporter}` : "ผู้รายงาน —"}</span></div>
            {report.reporterRole && <div style={{ ...headerInfoRow, marginLeft: 22 }}><span>{report.reporterRole}</span></div>}
          </div>
        </div>

        <div style={contentPad}>
        {/* ===== FEATURED NUMBERED STRIP ===== */}
        {featuredPhotos.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={previewSectionTitle}><Camera size={13} /> ภาพกิจกรรมหลัก</div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(featuredPhotos.length, 5)}, 1fr)`, gap: 8, marginTop: 8 }}>
              {featuredPhotos.map((p, i) => (
                <div key={p.id} style={{ position: "relative" }}>
                  <img src={p.src} alt="" style={featuredImgStyle} />
                  <div style={featuredNumberBadge}>{String(i + 1).padStart(2, "0")}</div>
                  {p.caption && <div style={{ fontFamily: "Sarabun", fontSize: 9, color: "#1B2A45", marginTop: 4, textAlign: "center", fontWeight: 500 }}>{p.caption}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== SUMMARY + RESULTS 2-col ===== */}
        {(report.summaryText || highlights.length > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: report.summaryText && highlights.length ? "1fr 1fr" : "1fr", gap: 10, marginBottom: 14 }}>
            {report.summaryText && (
              <div style={panelStyle}>
                <div style={previewSectionTitle}><FileText size={13} /> สรุปผลการปฏิบัติงาน</div>
                <div style={{ fontFamily: "Sarabun", fontSize: 11, color: "#2B2B2B", marginTop: 8, lineHeight: 1.7, textIndent: 18 }}>{report.summaryText}</div>
              </div>
            )}
            {highlights.length > 0 && (
              <div style={panelStyle}>
                <div style={previewSectionTitle}><Check size={13} /> ผลการดำเนินงาน</div>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  {highlights.map((h, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span style={checkBadge}>✓</span>
                      <span style={{ fontFamily: "Sarabun", fontSize: 11, color: "#2B2B2B", lineHeight: 1.5 }}>{h}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* KPI row */}
        {report.kpis.some((k) => k.label || k.value) && (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(report.kpis.length, 3)}, 1fr)`, gap: 8, marginBottom: 14 }}>
            {report.kpis.filter((k) => k.label || k.value).map((k) => (
              <div key={k.id} style={kpiBox}>
                <div style={{ fontFamily: "Kanit", fontWeight: 700, fontSize: 16, color: "#B8922F" }}>{k.value || "—"}</div>
                <div style={{ fontFamily: "Sarabun", fontSize: 10, color: "#55606E", marginTop: 2 }}>{k.label || "ตัวชี้วัด"}</div>
              </div>
            ))}
          </div>
        )}

        {/* ===== GALLERY ===== */}
        {galleryPhotos.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={galleryHeaderStyle}><Camera size={13} /> ภาพการปฏิบัติงานและการประสานงาน (ภาพบรรยากาศ)</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginTop: 8 }}>
              {galleryPhotos.slice(0, 10).map((p) => (
                <div key={p.id}>
                  <img src={p.src} alt="" style={{ width: "100%", height: 70, objectFit: "cover", borderRadius: 4, border: "1px solid #E0DACB" }} />
                  {p.caption && <div style={{ fontFamily: "Sarabun", fontSize: 8.5, color: "#55606E", marginTop: 2, textAlign: "center" }}>{p.caption}</div>}
                  {(p.date || p.location) && (
                    <div style={{ fontFamily: "Sarabun", fontSize: 7.5, color: "#9CA3AF", textAlign: "center" }}>
                      {[p.date, p.location].filter(Boolean).join(" • ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {totalPhotoCount > 0 && featuredPhotos.length === 0 && galleryPhotos.length === 0 && (
          <div style={{ fontFamily: "Sarabun", fontSize: 11, color: "#9CA3AF", textAlign: "center", padding: "10px 0" }}>
            ไม่พบภาพที่ตรงกับตัวกรองที่เลือก
          </div>
        )}

        {report.nextPlan && (
          <div style={{ marginBottom: 14 }}>
            <div style={previewSectionTitle}><Calendar size={12} /> แผนงานถัดไป</div>
            <div style={{ fontFamily: "Sarabun", fontSize: 11, color: "#2B2B2B", marginTop: 4 }}>{report.nextPlan}</div>
          </div>
        )}

        {/* ===== FOOTER: orders + signature ===== */}
        {(orders.length > 0 || report.reporter) && (
          <div style={footerBarStyle}>
            {orders.length > 0 && (
              <div style={{ flex: 1.2, display: "flex", gap: 10 }}>
                <div style={{ flexShrink: 0, marginTop: 2 }}><Users size={18} color="#1B2A45" /></div>
                <div>
                  <div style={{ fontFamily: "Kanit", fontWeight: 600, fontSize: 12, color: "#1B2A45", marginBottom: 6 }}>ข้อสั่งการ / แนวทางการปฏิบัติ</div>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {orders.map((o, i) => (
                      <li key={i} style={{ fontFamily: "Sarabun", fontSize: 10, color: "#2B2B2B", marginBottom: 4, lineHeight: 1.5 }}>{o}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {report.reporter && (
              <div style={{ flex: 1, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ fontFamily: "Kanit", fontWeight: 600, fontSize: 12, color: "#1B2A45", marginBottom: 12 }}>ลงชื่อผู้รายงาน</div>
                {report.signature ? (
                  <img src={report.signature} alt="signature" style={{ height: 45, objectFit: "contain", marginBottom: 6, background: "transparent", mixBlendMode: "screen" }} />
                ) : (
                  <div style={{ height: 45 }} />
                )}
                <div style={{ borderTop: "1px solid #B8B2A0", width: "85%", paddingTop: 6 }}>
                  <div style={{ fontFamily: "Sarabun", fontSize: 11, color: "#1B2A45", fontWeight: 600 }}>({report.reporter})</div>
                  {report.reporterRole && <div style={{ fontFamily: "Sarabun", fontSize: 10, color: "#55606E", marginTop: 2 }}>{report.reporterRole}</div>}
                </div>
              </div>
            )}
          </div>
        )}

        </div>
        {report.quote && (
          <div style={quoteBannerStyle}>&ldquo;{report.quote}&rdquo;</div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button style={{ ...printBtnStyle, flex: 1 }} onClick={onPrint}><Printer size={16} /> พิมพ์</button>
        <button style={{ ...printBtnStyle, flex: 1, background: "#B8922F", opacity: exportingPdf ? 0.7 : 1 }} onClick={onExportPdf} disabled={exportingPdf}>
          {exportingPdf ? <Loader2 size={16} className="spin" /> : <Download size={16} />} 
          {exportingPdf ? 'กำลังสร้าง PDF...' : 'บันทึก PDF'}
        </button>
        <button style={{ ...printBtnStyle, flex: 1, background: "#2E7D32", opacity: exportingImg ? 0.7 : 1 }} onClick={onExportImage} disabled={exportingImg}>
          {exportingImg ? <Loader2 size={16} className="spin" /> : <ImageIcon size={16} />} 
          {exportingImg ? 'กำลังสร้างรูป...' : 'บันทึกรูป'}
        </button>
      </div>
    </div>
  );
}

const pageStyle = {
  background: "#FFFFFF", borderRadius: 4,
  boxShadow: "0 2px 10px rgba(27,42,69,0.12)",
  width: "210mm",
  minHeight: "297mm",
  aspectRatio: "210 / 297",
  overflow: "auto",
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
};
const headerBarStyle = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  background: "linear-gradient(135deg, #1B2A45 0%, #2C3E5A 100%)", 
  padding: "20px 22px", gap: 16,
  borderBottom: "4px solid #B8922F",
};
const headerLogoStyle = { width: 80, height: 80, borderRadius: 8, objectFit: "contain", flexShrink: 0, background: "transparent" };
const headerInfoBoxStyle = { display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 };
const headerInfoRow = { display: "flex", alignItems: "center", gap: 7, fontFamily: "Sarabun", fontSize: 10, color: "#FFFFFF", whiteSpace: "nowrap" };
const contentPad = { padding: "16px 18px 0", flex: 1 };
const kpiBox = { background: "#F7F5EF", borderRadius: 6, padding: "8px 6px", textAlign: "center", border: "1px solid #E8E2D3" };
const previewSectionTitle = {
  fontFamily: "Kanit", fontWeight: 600, fontSize: 12, color: "#1B2A45",
  background: "linear-gradient(90deg, #E8E2D3 0%, #F5F2EA 100%)", 
  padding: "6px 12px", borderRadius: 4,
  display: "flex", alignItems: "center", gap: 6,
  marginBottom: 8,
  borderLeft: "4px solid #1B2A45",
};
const galleryHeaderStyle = {
  fontFamily: "Kanit", fontWeight: 600, fontSize: 11.5, color: "#FFFFFF",
  background: "linear-gradient(135deg, #1B2A45 0%, #2C3E5A 100%)", 
  padding: "8px 12px", borderRadius: 4,
  display: "flex", alignItems: "center", gap: 6,
  marginBottom: 8,
};
const panelStyle = { background: "#FBFAF6", border: "1px solid #E8E2D3", borderRadius: 8, padding: "10px 12px" };
const checkBadge = {
  width: 16, height: 16, borderRadius: "50%", background: "#1B2A45", color: "#FFFFFF",
  fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1,
};
const featuredImgStyle = { width: "100%", height: 90, objectFit: "cover", borderRadius: 4, border: "1px solid #E0DACB" };
const featuredNumberBadge = {
  position: "absolute", bottom: 5, left: 5, background: "#1B2A45", color: "#FFFFFF",
  fontFamily: "Kanit", fontWeight: 700, fontSize: 10, padding: "3px 8px", borderRadius: 4,
  boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
};
const footerBarStyle = {
  display: "flex", gap: 18, alignItems: "flex-start", 
  borderTop: "3px solid #1B2A45",
  paddingTop: 14, marginBottom: 12,
};
const quoteBannerStyle = {
  background: "linear-gradient(135deg, #1B2A45 0%, #2C3E5A 100%)", 
  color: "#FFFFFF", textAlign: "center", fontFamily: "Kanit",
  fontWeight: 500, fontSize: 11, padding: "10px 14px", letterSpacing: 0.3,
  borderTop: "2px solid #B8922F",
  marginTop: "auto",
};

const printBtnStyle = {
  marginTop: 14, width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
  gap: 7, background: "#1B2A45", color: "#F7F5EF", border: "none", borderRadius: 10,
  padding: "12px 0", fontFamily: "Sarabun", fontWeight: 600, fontSize: 14, cursor: "pointer",
};

/* ================= ROOT ================= */
export default function ReportSystem() {
  useFonts();
  const [config, setConfig] = useState(undefined); // undefined = checking, null = not configured
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [current, setCurrent] = useState(null);
  const [saving, setSaving] = useState(false);
  const [listError, setListError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showTeam, setShowTeam] = useState(false);
  // storageOk removed - localStorage always available

  useEffect(() => {
    (async () => {
      const cfg = await loadSupabaseConfig();
      setConfig(cfg);
    })();
  }, []);

  const loadIndex = useCallback(async () => {
    if (!config) return;
    setLoading(true);
    setListError("");
    try {
      const idx = await sbListReports(config);
      setReports(idx);
    } catch (e) {
      setListError(e.message || "โหลดรายการรายงานไม่สำเร็จ");
      setReports([]);
    }
    setLoading(false);
  }, [config]);

  useEffect(() => { if (config) loadIndex(); }, [config, loadIndex]);

  const openReport = async (id) => {
    if (!config) return;
    try {
      const data = await sbGetReport(config, id);
      if (data) {
        const migrated = {
          ...emptyReport(),
          ...data,
          photos: { featured: [], inspect: [], meeting: [], relation: [], ...(data.photos || {}) },
          orders: data.orders || [""],
        };
        setCurrent(migrated);
        setOpenId(id);
      }
    } catch (e) {
      setListError(e.message || "เปิดรายงานไม่สำเร็จ");
    }
  };

  const newReport = () => {
    const r = emptyReport();
    setCurrent(r);
    setOpenId(r.id);
  };

  const saveReport = async () => {
    if (!current || !config) return;
    setSaving(true);
    try {
      await sbUpsertReport(config, current);
      await loadIndex();
    } catch (e) {
      setListError(e.message || "บันทึกไม่สำเร็จ");
    }
    setSaving(false);
  };

  const deleteReport = async (id) => {
    if (!config) return;
    try {
      await sbDeleteReport(config, id);
      await loadIndex();
    } catch (e) {
      setListError(e.message || "ลบไม่สำเร็จ");
    }
  };

  const handlePrint = () => window.print();

  const wrapperStyle = { minHeight: "100vh", background: "#F7F5EF", fontFamily: "Sarabun" };
  const globalStyle = (
    <style>{`
      .spin { animation: rp-spin 0.9s linear infinite; }
      @keyframes rp-spin { to { transform: rotate(360deg); } }
      @media print {
        body * { visibility: hidden; }
        #one-page-report, #one-page-report * { visibility: visible; }
        #one-page-report { position: absolute; top: 0; left: 0; width: 100%; box-shadow: none; }
      }
      input:focus, textarea:focus { border-color: #B8922F !important; }
    `}</style>
  );

  if (config === undefined) {
    return (
      <div style={{ ...wrapperStyle, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {globalStyle}
        <Loader2 size={26} className="spin" color="#B8922F" />
      </div>
    );
  }

  if (!config || showSettings) {
    return (
      <div style={wrapperStyle}>
        {globalStyle}
        <SupabaseSetup
          initial={config}
          onSaved={(cfg) => { setConfig(cfg); setShowSettings(false); }}
        />
        {config && (
          <div style={{ textAlign: "center", paddingBottom: 24 }}>
            <button onClick={() => setShowSettings(false)} style={{ background: "none", border: "none", color: "#55606E", fontFamily: "Sarabun", fontSize: 12.5, cursor: "pointer", textDecoration: "underline" }}>
              ยกเลิก กลับไปหน้ารายงาน
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={wrapperStyle}>
      {globalStyle}
      {showTeam ? (
        <TeamManagement config={config} onBack={() => setShowTeam(false)} />
      ) : openId && current ? (
        <EditorView
          report={current}
          onChange={setCurrent}
          onBack={() => { setOpenId(null); setCurrent(null); }}
          onSave={saveReport}
          onPrint={handlePrint}
          saving={saving}
        />
      ) : (
        <ListView
          reports={reports}
          onOpen={openReport}
          onNew={newReport}
          onDelete={deleteReport}
          loading={loading}
          onOpenSettings={() => setShowSettings(true)}
          onOpenTeam={() => setShowTeam(true)}
          error={listError}
        />
      )}
    </div>
  );
}
