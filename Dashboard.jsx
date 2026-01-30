import { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';
import {
  LogOut,
  Users,
  ClipboardList,
  BarChart3,
  Plus,
  Trash2,
  Pencil,
  X,
  Calendar as CalendarIcon,
  GraduationCap,
  CheckCircle2,
  FileText,
  Table,
  Search,
  CheckSquare,
  AlertTriangle, // IMPORT BARU: Icon untuk peringatan Alpha
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format, subDays, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { id } from 'date-fns/locale';

export default function Dashboard() {
  const navigate = useNavigate();

  // --- FUNGSI TANGGAL LOKAL ---
  const getLocalToday = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  };

  // --- STATE UTAMA ---
  const [activeTab, setActiveTab] = useState('presensi');
  const [loading, setLoading] = useState(true);
  const [teacher, setTeacher] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // State Kelas & Siswa
  const [selectedGrade, setSelectedGrade] = useState('1');
  const [selectedRombel, setSelectedRombel] = useState('A');
  const [students, setStudents] = useState([]);

  // State Presensi Harian (Tab Presensi)
  const [selectedDate, setSelectedDate] = useState(getLocalToday());
  const [attendanceLog, setAttendanceLog] = useState({});
  const [attendanceHistory, setAttendanceHistory] = useState([]);

  // State Manage Siswa
  const [studentName, setStudentName] = useState('');
  const [studentNis, setStudentNis] = useState('');
  const [editingId, setEditingId] = useState(null);

  // --- STATE UNTUK REKAP LAPORAN ---
  const [reportTab, setReportTab] = useState('grafik'); // 'grafik' | 'harian' | 'bulanan'
  const [reportDate, setReportDate] = useState(getLocalToday()); // Tanggal untuk rekap harian
  const [reportMonth, setReportMonth] = useState(getLocalToday().slice(0, 7)); // YYYY-MM
  const [monthlyData, setMonthlyData] = useState({}); // Data rekap bulanan
  const [dailyRecapData, setDailyRecapData] = useState({}); // Data rekap harian khusus tab laporan

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (teacher?.id && teacher?.class_id) {
      fetchAttendanceLog(selectedDate); // Untuk tab Presensi utama
    }
  }, [selectedDate, teacher]);

  // Effect untuk Tab Laporan (Fetch data saat tab/tanggal berubah)
  useEffect(() => {
    if (activeTab === 'laporan' && teacher?.id) {
      if (reportTab === 'harian') fetchDailyRecap(reportDate);
      if (reportTab === 'bulanan') fetchMonthlyRecap(reportMonth);
    }
  }, [activeTab, reportTab, reportDate, reportMonth, teacher]);

  // --- LOGIKA UTAMA: LOGIN & DATA ---
  const fetchInitialData = async () => {
    setLoading(true);
    setErrorMsg(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return navigate('/');

    try {
      let { data: teacherData } = await supabase
        .from('teachers')
        .select('*, classes(display_name)')
        .eq('id', user.id)
        .maybeSingle();

      if (!teacherData) {
        const fullName =
          user.user_metadata?.full_name || user.email?.split('@')[0];
        const { data: newTeacher, error: createErr } = await supabase
          .from('teachers')
          .insert([{ id: user.id, full_name: fullName, email: user.email }])
          .select()
          .single();
        if (createErr) throw createErr;
        teacherData = newTeacher;
      }

      setTeacher(teacherData);
      if (teacherData.class_id) {
        await fetchStudents(teacherData.class_id);
        await fetchHistory(teacherData.id);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- FITUR: FETCH REKAP HARIAN (KHUSUS TAB LAPORAN) ---
  const fetchDailyRecap = async (date) => {
    const { data } = await supabase
      .from('attendance')
      .select('student_id, status')
      .eq('date', date)
      .eq('teacher_id', teacher.id);

    const log = {};
    data?.forEach((r) => (log[r.student_id] = r.status));
    setDailyRecapData(log);
  };

  // --- FITUR: FETCH REKAP BULANAN ---
  const fetchMonthlyRecap = async (monthStr) => {
    // monthStr format "YYYY-MM"
    const startDate = `${monthStr}-01`;

    // Hitung range tanggal
    const start = new Date(startDate);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0); // Tgl terakhir bulan ini

    const { data } = await supabase
      .from('attendance')
      .select('student_id, status, date')
      .eq('teacher_id', teacher.id)
      .gte('date', startDate)
      .lte('date', end.toISOString().split('T')[0]);

    // Proses Agregasi Data
    const stats = {};
    // Inisialisasi semua siswa dengan 0
    students.forEach((s) => {
      stats[s.id] = { H: 0, I: 0, S: 0, A: 0 };
    });

    // Hitung jumlah status
    data?.forEach((row) => {
      if (stats[row.student_id]) {
        const s = row.status;
        if (s === 'Hadir') stats[row.student_id].H++;
        else if (s === 'Izin') stats[row.student_id].I++;
        else if (s === 'Sakit') stats[row.student_id].S++;
        else if (s === 'Alpa') stats[row.student_id].A++;
      }
    });
    setMonthlyData(stats);
  };

  // --- LOGIKA KELAS ---
  const handleCreateAndLinkClass = async () => {
    try {
      setLoading(true);
      const displayName = `${selectedGrade}${selectedRombel}`;
      let classId = null;
      const { data: existing } = await supabase
        .from('classes')
        .select('id')
        .eq('display_name', displayName)
        .maybeSingle();
      if (existing) {
        classId = existing.id;
      } else {
        const { data: newClass, error } = await supabase
          .from('classes')
          .insert({
            grade_level: selectedGrade,
            section: selectedRombel,
            display_name: displayName,
          })
          .select()
          .single();
        if (error) throw error;
        classId = newClass.id;
      }
      await supabase
        .from('teachers')
        .update({ class_id: classId })
        .eq('id', teacher.id);
      window.location.reload();
    } catch (err) {
      alert(err.message);
      setLoading(false);
    }
  };

  // --- HELPER LAINNYA ---
  const fetchStudents = async (cid) => {
    const { data } = await supabase
      .from('students')
      .select('*')
      .eq('class_id', cid)
      .order('name');
    setStudents(data || []);
  };

  const fetchAttendanceLog = async (d) => {
    const { data } = await supabase
      .from('attendance')
      .select('student_id, status')
      .eq('date', d)
      .eq('teacher_id', teacher.id);
    const log = {};
    data?.forEach((r) => (log[r.student_id] = r.status));
    setAttendanceLog(log);
  };

  const fetchHistory = async (tid) => {
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('teacher_id', tid)
      .gte('created_at', subDays(new Date(), 7).toISOString());
    setAttendanceHistory(data || []);
  };

  const handleAbsen = async (sid, st) => {
    setAttendanceLog((p) => ({ ...p, [sid]: st }));
    await supabase
      .from('attendance')
      .delete()
      .eq('student_id', sid)
      .eq('date', selectedDate);
    await supabase.from('attendance').insert({
      student_id: sid,
      teacher_id: teacher.id,
      status: st,
      date: selectedDate,
    });
  };

  // --- FITUR: HADIR SEMUA ---
  const handleMarkAllPresent = async () => {
    if (students.length === 0) return;
    if (!confirm('Tandai SEMUA siswa sebagai HADIR untuk tanggal ini?')) return;

    // 1. Optimistic Update
    const newLog = {};
    const records = [];

    students.forEach((s) => {
      newLog[s.id] = 'Hadir';
      records.push({
        student_id: s.id,
        teacher_id: teacher.id,
        status: 'Hadir',
        date: selectedDate,
      });
    });
    setAttendanceLog(newLog);

    try {
      // 2. Hapus data lama tanggal ini
      await supabase
        .from('attendance')
        .delete()
        .eq('date', selectedDate)
        .eq('teacher_id', teacher.id);

      // 3. Insert data baru secara massal
      const { error } = await supabase.from('attendance').insert(records);
      if (error) throw error;
    } catch (err) {
      console.error(err);
      alert('Gagal menyimpan data massal, silakan refresh.');
    }
  };

  const handleSaveStudent = async (e) => {
    e.preventDefault();
    if (editingId)
      await supabase
        .from('students')
        .update({ name: studentName, nis: studentNis })
        .eq('id', editingId);
    else
      await supabase.from('students').insert({
        name: studentName,
        nis: studentNis,
        class_id: teacher.class_id,
        photo_url: `https://ui-avatars.com/api/?name=${studentName}&background=random`,
      });
    setEditingId(null);
    setStudentName('');
    setStudentNis('');
    fetchStudents(teacher.class_id);
  };

  const handleDeleteStudent = async (id) => {
    if (!confirm('Hapus?')) return;
    await supabase.from('attendance').delete().eq('student_id', id);
    await supabase.from('students').delete().eq('id', id);
    fetchStudents(teacher.class_id);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  // Chart Data Helper
  const chartData = useMemo(() => {
    const d = [];
    for (let i = 6; i >= 0; i--) {
      const dt = subDays(new Date(), i);
      const ds = dt.toISOString().split('T')[0];
      d.push({
        date: format(dt, 'dd MMM', { locale: id }),
        Hadir: attendanceHistory.filter(
          (r) => r.date === ds && r.status === 'Hadir'
        ).length,
      });
    }
    return d;
  }, [attendanceHistory]);

  if (loading)
    return (
      <div className="flex h-screen justify-center items-center text-blue-600 font-bold animate-pulse">
        Memuat...
      </div>
    );
  if (errorMsg)
    return (
      <div className="p-10 text-center text-red-500">
        Error: {errorMsg} <br />
        <button
          onClick={() => window.location.reload()}
          className="mt-4 bg-blue-600 text-white px-4 py-2 rounded"
        >
          Refresh
        </button>
      </div>
    );

  // TAMPILAN 1: PILIH KELAS
  if (!teacher?.class_id) {
    return (
      <div className="min-h-screen bg-blue-50 flex items-center justify-center p-4 font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md text-center">
          <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 text-blue-600">
            <GraduationCap size={32} />
          </div>
          <h2 className="text-2xl font-bold mb-6">
            Halo, {teacher?.full_name}
          </h2>
          <div className="space-y-4 text-left">
            <div>
              <label className="font-bold text-sm">Kelas</label>
              <select
                className="w-full p-2 border rounded"
                value={selectedGrade}
                onChange={(e) => setSelectedGrade(e.target.value)}
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-bold text-sm">Rombel</label>
              <select
                className="w-full p-2 border rounded"
                value={selectedRombel}
                onChange={(e) => setSelectedRombel(e.target.value)}
              >
                {['A', 'B', 'C', 'D', 'E'].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleCreateAndLinkClass}
              className="w-full bg-blue-600 text-white py-3 rounded font-bold hover:bg-blue-700 flex justify-center gap-2"
            >
              <CheckCircle2 /> Masuk Kelas
            </button>
            <button
              onClick={handleLogout}
              className="w-full text-gray-400 text-xs hover:text-red-500"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    );
  }

  // TAMPILAN 2: DASHBOARD
  return (
    <div className="min-h-screen bg-gray-50 font-sans pb-24">
      <header className="bg-blue-600 text-white p-4 shadow sticky top-0 z-20 flex justify-between items-center">
        <div>
          <h1 className="font-bold">{teacher.full_name}</h1>
          <p className="text-xs">Kelas {teacher.classes?.display_name}</p>
        </div>
        <button onClick={handleLogout} className="bg-white/20 p-2 rounded">
          <LogOut size={18} />
        </button>
      </header>

      <div className="container mx-auto max-w-2xl p-4">
        {/* TAB 1: PRESENSI UTAMA */}
        {activeTab === 'presensi' && (
          <div className="space-y-4">
            <div className="bg-white p-3 rounded shadow flex justify-between items-center">
              <div className="flex gap-2 items-center text-blue-600 font-bold">
                <CalendarIcon size={20} /> Tanggal
              </div>
              <input
                type="date"
                className="border rounded p-1 font-bold"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                max={getLocalToday()}
              />
            </div>

            {/* --- FITUR: TOMBOL HADIR SEMUA --- */}
            {students.length > 0 && (
              <button
                onClick={handleMarkAllPresent}
                className="w-full bg-blue-600 text-white py-2 rounded shadow font-bold flex justify-center items-center gap-2 hover:bg-blue-700 active:scale-95 transition-all"
              >
                <CheckSquare size={18} /> Hadirkan Semua Siswa
              </button>
            )}

            {students.length === 0 ? (
              <div className="text-center py-10 text-gray-400 border border-dashed bg-white rounded">
                Belum ada siswa
              </div>
            ) : (
              students.map((s) => (
                <div
                  key={s.id}
                  className="bg-white p-4 rounded shadow border-gray-100"
                >
                  <div className="flex gap-3 mb-3">
                    <img
                      src={s.photo_url}
                      className="w-10 h-10 rounded-full bg-gray-200"
                    />
                    <div className="font-bold">
                      {s.name}
                      <div className="text-xs text-gray-400">{s.nis}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {['Hadir', 'Izin', 'Sakit', 'Alpa'].map((st) => (
                      <button
                        key={st}
                        onClick={() => handleAbsen(s.id, st)}
                        className={`py-2 text-xs font-bold rounded ${
                          attendanceLog[s.id] === st
                            ? st === 'Hadir'
                              ? 'bg-blue-600 text-white'
                              : st === 'Izin'
                              ? 'bg-yellow-500 text-white'
                              : st === 'Sakit'
                              ? 'bg-green-500 text-white'
                              : 'bg-red-500 text-white'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 2: MANAJEMEN SISWA */}
        {activeTab === 'siswa' && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded shadow">
              <h3 className="font-bold mb-3 text-blue-600 flex gap-2">
                <Plus size={18} /> {editingId ? 'Edit' : 'Tambah'} Siswa
              </h3>
              <form onSubmit={handleSaveStudent} className="space-y-2">
                <input
                  className="w-full p-2 border rounded"
                  placeholder="Nama"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  required
                />
                <input
                  className="w-full p-2 border rounded"
                  placeholder="NIS"
                  value={studentNis}
                  onChange={(e) => setStudentNis(e.target.value)}
                  required
                />
                <div className="flex gap-2">
                  <button className="flex-1 bg-blue-600 text-white py-2 rounded font-bold">
                    Simpan
                  </button>
                  {editingId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setStudentName('');
                        setStudentNis('');
                      }}
                      className="px-3 bg-gray-200 rounded"
                    >
                      <X />
                    </button>
                  )}
                </div>
              </form>
            </div>
            <div className="bg-white rounded shadow overflow-hidden">
              <div className="bg-gray-100 p-2 text-xs font-bold uppercase text-gray-500">
                Siswa ({students.length})
              </div>
              <div className="divide-y">
                {students.map((s) => (
                  <div key={s.id} className="flex justify-between p-3">
                    <div>
                      <div className="font-bold">{s.name}</div>
                      <div className="text-xs text-gray-400">{s.nis}</div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setEditingId(s.id);
                          setStudentName(s.name);
                          setStudentNis(s.nis);
                        }}
                        className="p-2 text-blue-500 bg-blue-50 rounded"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteStudent(s.id)}
                        className="p-2 text-red-500 bg-red-50 rounded"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: LAPORAN & REKAP */}
        {activeTab === 'laporan' && (
          <div className="space-y-4">
            {/* Navigasi Sub-Tab Laporan */}
            <div className="flex bg-white rounded shadow p-1">
              <button
                onClick={() => setReportTab('grafik')}
                className={`flex-1 py-2 text-sm font-bold rounded flex justify-center items-center gap-2 ${
                  reportTab === 'grafik'
                    ? 'bg-blue-100 text-blue-600'
                    : 'text-gray-500'
                }`}
              >
                <BarChart3 size={16} /> Grafik
              </button>
              <button
                onClick={() => setReportTab('harian')}
                className={`flex-1 py-2 text-sm font-bold rounded flex justify-center items-center gap-2 ${
                  reportTab === 'harian'
                    ? 'bg-blue-100 text-blue-600'
                    : 'text-gray-500'
                }`}
              >
                <FileText size={16} /> Harian
              </button>
              <button
                onClick={() => setReportTab('bulanan')}
                className={`flex-1 py-2 text-sm font-bold rounded flex justify-center items-center gap-2 ${
                  reportTab === 'bulanan'
                    ? 'bg-blue-100 text-blue-600'
                    : 'text-gray-500'
                }`}
              >
                <Table size={16} /> Bulanan
              </button>
            </div>

            {/* SUB-TAB 1: GRAFIK */}
            {reportTab === 'grafik' && (
              <div className="bg-white p-4 rounded shadow">
                <h3 className="font-bold mb-4 text-blue-600">
                  Tren Kehadiran (7 Hari Terakhir)
                </h3>
                <div className="h-64">
                  <ResponsiveContainer>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="Hadir"
                        stroke="#2563eb"
                        strokeWidth={3}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* SUB-TAB 2: REKAP HARIAN */}
            {reportTab === 'harian' && (
              <div className="bg-white rounded shadow overflow-hidden">
                <div className="p-3 bg-blue-50 border-b flex justify-between items-center">
                  <span className="font-bold text-blue-800">
                    Laporan Harian
                  </span>
                  <input
                    type="date"
                    className="text-sm border p-1 rounded"
                    value={reportDate}
                    onChange={(e) => setReportDate(e.target.value)}
                  />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 text-gray-600">
                      <tr>
                        <th className="p-3 text-left">Nama Siswa</th>
                        <th className="p-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {students.map((s, idx) => (
                        <tr
                          key={s.id}
                          className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                        >
                          <td className="p-3 font-medium">{s.name}</td>
                          <td className="p-3 text-center">
                            <span
                              className={`px-2 py-1 rounded text-xs font-bold ${
                                dailyRecapData[s.id] === 'Hadir'
                                  ? 'bg-blue-100 text-blue-600'
                                  : dailyRecapData[s.id] === 'Sakit'
                                  ? 'bg-green-100 text-green-600'
                                  : dailyRecapData[s.id] === 'Izin'
                                  ? 'bg-yellow-100 text-yellow-600'
                                  : dailyRecapData[s.id] === 'Alpa'
                                  ? 'bg-red-100 text-red-600'
                                  : 'bg-gray-100 text-gray-400'
                              }`}
                            >
                              {dailyRecapData[s.id] || '-'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SUB-TAB 3: REKAP BULANAN */}
            {reportTab === 'bulanan' && (
              <div className="space-y-4">
                {/* --- FITUR BARU: TOP 7 ALPHA --- */}
                {(() => {
                  const topAlpha = students
                    .map((s) => ({
                      ...s,
                      alphaCount: monthlyData[s.id]?.A || 0,
                    }))
                    .sort((a, b) => b.alphaCount - a.alphaCount)
                    .filter((s) => s.alphaCount > 0)
                    .slice(0, 7);

                  if (topAlpha.length === 0) return null;

                  return (
                    <div className="bg-red-50 border border-red-100 rounded p-4 shadow-sm">
                      <h4 className="font-bold text-red-800 mb-3 flex items-center gap-2 text-sm uppercase">
                        <AlertTriangle size={18} /> Top 7 Paling Banyak Alpha
                      </h4>
                      <div className="grid grid-cols-1 gap-2">
                        {topAlpha.map((s) => (
                          <div
                            key={s.id}
                            className="flex justify-between items-center bg-white p-2 rounded border border-red-100"
                          >
                            <span className="text-sm font-medium text-gray-700">
                              {s.name}
                            </span>
                            <span className="bg-red-100 text-red-600 px-2 py-1 rounded text-xs font-bold">
                              {s.alphaCount}x Alpha
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                <div className="bg-white rounded shadow overflow-hidden">
                  <div className="p-3 bg-blue-50 border-b flex justify-between items-center">
                    <span className="font-bold text-blue-800">
                      Rekap Bulanan
                    </span>
                    <input
                      type="month"
                      className="text-sm border p-1 rounded"
                      value={reportMonth}
                      onChange={(e) => setReportMonth(e.target.value)}
                    />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-100 text-gray-600">
                        <tr>
                          <th className="p-2 text-left">Nama</th>
                          <th className="p-2 text-center text-blue-600">H</th>
                          <th className="p-2 text-center text-green-600">S</th>
                          <th className="p-2 text-center text-yellow-600">I</th>
                          <th className="p-2 text-center text-red-600">A</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {students.map((s, idx) => {
                          const stat = monthlyData[s.id] || {
                            H: 0,
                            S: 0,
                            I: 0,
                            A: 0,
                          };
                          return (
                            <tr
                              key={s.id}
                              className={
                                idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                              }
                            >
                              <td className="p-2 font-medium">{s.name}</td>
                              <td className="p-2 text-center font-bold">
                                {stat.H}
                              </td>
                              <td className="p-2 text-center font-bold text-gray-500">
                                {stat.S}
                              </td>
                              <td className="p-2 text-center font-bold text-gray-500">
                                {stat.I}
                              </td>
                              <td className="p-2 text-center font-bold text-red-500">
                                {stat.A}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="p-2 text-xs text-gray-400 text-center">
                    H: Hadir, S: Sakit, I: Izin, A: Alpa
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <nav className="fixed bottom-0 w-full bg-white border-t flex justify-around p-3 shadow z-30">
        <button
          onClick={() => setActiveTab('presensi')}
          className={
            activeTab === 'presensi'
              ? 'text-blue-600 font-bold'
              : 'text-gray-400'
          }
        >
          <ClipboardList className="mx-auto" />
          Presensi
        </button>
        <button
          onClick={() => setActiveTab('siswa')}
          className={
            activeTab === 'siswa' ? 'text-blue-600 font-bold' : 'text-gray-400'
          }
        >
          <Users className="mx-auto" />
          Siswa
        </button>
        <button
          onClick={() => setActiveTab('laporan')}
          className={
            activeTab === 'laporan'
              ? 'text-blue-600 font-bold'
              : 'text-gray-400'
          }
        >
          <BarChart3 className="mx-auto" />
          Laporan
        </button>
      </nav>
    </div>
  );
}
