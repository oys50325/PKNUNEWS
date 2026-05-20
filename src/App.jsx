import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  BookOpenText,
  CalendarDays,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  FileUp,
  GraduationCap,
  Info,
  KeyRound,
  Lock,
  LogIn,
  LogOut,
  Newspaper,
  PanelTop,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
  UserRound,
  UsersRound,
} from "lucide-react";
import { listIssues, listUsers, publishIssue, realtimeDatabaseReady, removeIssue, saveUsers } from "./firebase.js";

const ADMIN_ACCOUNT = { name: "PKNUNEWS", passcode: "50321004", role: "admin", studentYear: "관리자", approved: true };
const USERS_KEY = "ps1-news-netter-users";
const SESSION_KEY = "ps1-news-netter-session";
const PASSCODE_NOTICE = "비밀번호는 숫자 8자리입니다.";
const SUBADMIN_LIMIT = 3;

const SECTION_DEFS = [
  { key: "major", label: "전공소식", icon: Newspaper, hints: ["전공소식", "학부", "학생", "비교과", "장학", "모집"] },
  { key: "faculty", label: "교수동정", icon: UserRound, hints: ["교수동정", "교수", "연구", "논문", "학회", "수상"] },
  { key: "graduate", label: "대학원 소식", icon: GraduationCap, hints: ["대학원", "글로벌정책대학원", "일반대학원", "석사", "박사"] },
  { key: "calendar", label: "월별 전공 일정", icon: CalendarDays, hints: ["일정", "달력", "학사", "행사", "월별"] },
  { key: "interview", label: "복 들어오는 인터뷰", icon: UsersRound, hints: ["인터뷰", "복 들어오는", "동문", "재학생", "졸업생"] },
  { key: "info", label: "알기 쉬운 사회복지 정보통", icon: Info, hints: ["사회복지 정보통", "알기 쉬운", "정책", "제도", "복지정보"] },
];

const SAMPLE_EVENTS = [
  { date: "6.03", title: "전공 뉴스레터 원고 마감" },
  { date: "6.12", title: "복 들어오는 인터뷰 촬영" },
  { date: "6.24", title: "PS1 NEWS LETTER 발행" },
];

const STUDENT_YEARS = Array.from({ length: 41 }, (_, index) => String(2010 + index));

export default function App() {
  const [session, setSession] = useState(() => readSession());
  const [authMode, setAuthMode] = useState("login");
  const [authMessage, setAuthMessage] = useState("");
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [users, setUsers] = useState(() => readUsers());
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [loginForm, setLoginForm] = useState({ name: "", passcode: "" });
  const [signupForm, setSignupForm] = useState({ name: "", studentYear: "2025", passcode: "", confirmPasscode: "" });
  const [changeForm, setChangeForm] = useState({ currentPasscode: "", nextPasscode: "", confirmPasscode: "" });
  const [forgotName, setForgotName] = useState("");

  const [issues, setIssues] = useState([]);
  const [activeIssue, setActiveIssue] = useState(null);
  const [extracted, setExtracted] = useState(null);
  const [status, setStatus] = useState("PDF를 첨부하면 뉴스레터 전시본을 자동으로 만듭니다.");
  const [isBusy, setIsBusy] = useState(false);
  const [query, setQuery] = useState("");

  const isAdmin = session?.role === "admin";
  const canApproveUsers = session?.role === "admin" || session?.role === "subadmin";
  const pendingUsers = users.filter((user) => !user.approved);
  const approvedUsers = users.filter((user) => user.approved);
  const passwordRequests = users.filter((user) => user.resetRequested);
  const subadminCount = users.filter((user) => user.role === "subadmin").length;

  useEffect(() => {
    if (session) refreshIssues();
  }, [session]);

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (!usersLoaded) return;
    saveUsers(users).catch((error) => {
      setStatus(`가입자 정보를 저장하지 못했습니다: ${error.message}`);
    });
  }, [users, usersLoaded]);

  const filteredIssues = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return issues;
    return issues.filter((issue) =>
      [issue.title, issue.edition, issue.monthLabel, issue.summary].some((value) =>
        String(value || "").toLowerCase().includes(keyword),
      ),
    );
  }, [issues, query]);

  const latestIssue = activeIssue || issues[0] || null;
  const previewIssue = extracted || latestIssue || createWelcomeIssue();

  function togglePassword(key) {
    setVisiblePasswords((current) => ({ ...current, [key]: !current[key] }));
  }

  function handleSignup(event) {
    event.preventDefault();
    const name = signupForm.name.trim();
    const validation = validatePasscodePair(signupForm.passcode, signupForm.confirmPasscode);
    if (!name) return setAuthMessage("이름을 입력해주세요.");
    if (name === ADMIN_ACCOUNT.name || users.some((user) => user.name === name)) return setAuthMessage("이미 가입된 이름입니다.");
    if (validation) return setAuthMessage(validation);

    setUsers((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        name,
        studentYear: signupForm.studentYear,
        passcode: signupForm.passcode,
        role: "user",
        approved: false,
        resetRequested: false,
        createdAt: new Date().toISOString(),
      },
    ]);
    setAuthMessage("가입 신청이 완료되었습니다. 관리자 또는 부관리자 승인 후 이용할 수 있습니다.");
    setAuthMode("login");
    setSignupForm({ name: "", studentYear: "2025", passcode: "", confirmPasscode: "" });
  }

  function handleLogin(event) {
    event.preventDefault();
    const name = loginForm.name.trim();
    const passcode = loginForm.passcode.trim();
    const account = name === ADMIN_ACCOUNT.name ? ADMIN_ACCOUNT : users.find((user) => user.name === name);
    if (!account || account.passcode !== passcode) return setAuthMessage("이름 또는 비밀번호가 맞지 않습니다.");
    if (!account.approved) return setAuthMessage("아직 승인 대기 중입니다. 관리자 또는 부관리자 승인 후 이용할 수 있습니다.");

    const nextSession = {
      id: account.id || "admin",
      name: account.name,
      role: account.role,
      studentYear: account.studentYear,
      signedInAt: new Date().toISOString(),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
    setAuthMessage("");
  }

  function handleLogout() {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setLoginForm({ name: "", passcode: "" });
  }

  function approveUser(userId) {
    if (!canApproveUsers) return;
    setUsers((current) =>
      current.map((user) => (user.id === userId ? { ...user, approved: true, approvedAt: new Date().toISOString() } : user)),
    );
    setStatus("가입자를 승인했습니다.");
  }

  function expelUser(userId) {
    if (!isAdmin) return;
    const target = users.find((user) => user.id === userId);
    setUsers((current) => current.filter((user) => user.id !== userId));
    if (target?.name === session?.name) handleLogout();
    setStatus("선택한 사용자를 강제 탈퇴시켰습니다.");
  }

  function setSubadmin(userId, enabled) {
    if (!isAdmin) return;
    if (enabled && subadminCount >= SUBADMIN_LIMIT) return setStatus(`부관리자는 최대 ${SUBADMIN_LIMIT}명까지 지정할 수 있습니다.`);
    setUsers((current) =>
      current.map((user) => (user.id === userId ? { ...user, role: enabled ? "subadmin" : "user", approved: true } : user)),
    );
    setStatus(enabled ? "부관리자로 지정했습니다." : "부관리자 지정을 해제했습니다.");
  }

  function handleChangePasscode(event) {
    event.preventDefault();
    const validation = validatePasscodePair(changeForm.nextPasscode, changeForm.confirmPasscode);
    if (validation) return setStatus(validation);
    if (isAdmin) {
      if (changeForm.currentPasscode !== ADMIN_ACCOUNT.passcode) return setStatus("기존 관리자 비밀번호가 맞지 않습니다.");
      return setStatus("기본 관리자 비밀번호는 코드에 고정되어 있어 이 화면에서는 변경하지 않습니다.");
    }
    const target = users.find((user) => user.name === session.name);
    if (!target || target.passcode !== changeForm.currentPasscode) return setStatus("기존 비밀번호가 맞지 않습니다.");
    setUsers((current) =>
      current.map((user) =>
        user.id === target.id
          ? { ...user, passcode: changeForm.nextPasscode, resetRequested: false, updatedAt: new Date().toISOString() }
          : user,
      ),
    );
    setChangeForm({ currentPasscode: "", nextPasscode: "", confirmPasscode: "" });
    setStatus("비밀번호가 변경되었습니다.");
  }

  function handleForgotRequest(event) {
    event.preventDefault();
    const name = forgotName.trim();
    const target = users.find((user) => user.name === name);
    if (!target) return setAuthMessage("가입된 이름을 찾지 못했습니다.");
    setUsers((current) =>
      current.map((user) =>
        user.id === target.id ? { ...user, resetRequested: true, requestedAt: new Date().toISOString() } : user,
      ),
    );
    setForgotName("");
    setAuthMessage("비밀번호 확인 요청을 보냈습니다. 관리자에게 문의해주세요.");
  }

  function clearPasswordRequest(userId) {
    if (!isAdmin) return;
    setUsers((current) => current.map((user) => (user.id === userId ? { ...user, resetRequested: false } : user)));
    setStatus("비밀번호 확인 요청을 처리 완료로 표시했습니다.");
  }

  async function refreshIssues() {
    try {
      setIssues(await listIssues());
    } catch (error) {
      setStatus(`기록실을 불러오지 못했습니다: ${error.message}`);
    }
  }

  async function loadUsers() {
    try {
      const savedUsers = await listUsers();
      setUsers(savedUsers.map((user) => ({ ...user, role: user.role || "user", approved: Boolean(user.approved) })));
    } catch (error) {
      setStatus(`Realtime Database 가입자 정보를 불러오지 못했습니다: ${error.message}`);
    } finally {
      setUsersLoaded(true);
    }
  }

  async function handleFile(file) {
    if (!file) return;
    setIsBusy(true);
    setExtracted(null);
    setStatus("PDF를 읽고 있습니다. 텍스트와 페이지 이미지를 가볍게 변환하는 중입니다.");
    try {
      const issue = await extractNewsletter(file, (message) => setStatus(message));
      setExtracted(issue);
      setActiveIssue(null);
      setStatus("전시본이 준비되었습니다. 내용을 확인한 뒤 게재 승인 버튼을 눌러주세요.");
    } catch (error) {
      setStatus(`PDF 처리 중 문제가 생겼습니다: ${error.message}`);
    } finally {
      setIsBusy(false);
    }
  }

  async function handlePublish() {
    if (!extracted) return;
    setIsBusy(true);
    setStatus("게재 중입니다. 원본 PDF는 저장하지 않고 압축된 전시 이미지와 요약 데이터만 보관합니다.");
    try {
      await publishIssue(extracted);
      setExtracted(null);
      await refreshIssues();
      setStatus("게재가 완료되었습니다. PDF 원본은 브라우저 메모리에서만 사용되고 보관되지 않습니다.");
    } catch (error) {
      setStatus(`게재 실패: ${error.message}`);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRemove(issue) {
    if (!isAdmin) return;
    setIsBusy(true);
    try {
      await removeIssue(issue);
      await refreshIssues();
      setActiveIssue(null);
      setStatus("선택한 뉴스레터를 기록실에서 삭제했습니다.");
    } catch (error) {
      setStatus(`삭제 실패: ${error.message}`);
    } finally {
      setIsBusy(false);
    }
  }

  if (!session) {
    return (
      <AuthGate
        authMode={authMode}
        setAuthMode={setAuthMode}
        authMessage={authMessage}
        loginForm={loginForm}
        setLoginForm={setLoginForm}
        signupForm={signupForm}
        setSignupForm={setSignupForm}
        forgotName={forgotName}
        setForgotName={setForgotName}
        visiblePasswords={visiblePasswords}
        togglePassword={togglePassword}
        onLogin={handleLogin}
        onSignup={handleSignup}
        onForgotRequest={handleForgotRequest}
      />
    );
  }

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#home" aria-label="PS1 NEWS NETTER 홈">
          <img src="/assets/ps1-logo.jpg" alt="PS1 로고" />
          <span>
            <strong>PS1 NEWS NETTER</strong>
            <small>사회복지학전공 뉴스레터 전시실</small>
          </span>
        </a>
        <nav>
          <a href="#upload">PDF 게재</a>
          <a href="#newsletter">뉴스레터</a>
          <a href="#archive">지난 뉴스레터 보기</a>
          <a href="#account">계정</a>
          <button className="nav-button" type="button" onClick={handleLogout}><LogOut size={16} />로그아웃</button>
        </nav>
      </header>

      <section id="home" className="hero">
        <div className="hero-copy">
          <p>PKNU Social Welfare · PS1 NEWS LETTER</p>
          <h1>PS1 NEWS NETTER</h1>
          <span>PDF 하나로 뉴스레터 전시, 기록실, 월별 일정까지 가볍게 운영합니다.</span>
        </div>
        <div className="hero-panel">
          <Newspaper size={34} />
          <strong>{previewIssue.edition}</strong>
          <span>{previewIssue.monthLabel}</span>
        </div>
      </section>

      <section className="operations" aria-label="운영 방식">
        <article><FileUp size={22} /><strong>PDF 첨부</strong><span>승인된 구성원은 누구나 뉴스레터 전시본을 만들 수 있습니다.</span></article>
        <article><PanelTop size={22} /><strong>자동 전시</strong><span>텍스트를 영역별로 정리하고 페이지 이미지를 압축합니다.</span></article>
        <article><ShieldCheck size={22} /><strong>승인 후 게재</strong><span>원본 PDF 대신 승인 결과만 저장해 사용량을 최소화합니다.</span></article>
      </section>

      <section id="upload" className="admin-layout">
        <div className="upload-zone">
          <div>
            <span className="eyebrow"><Sparkles size={16} /> 뉴스레터 작업대</span>
            <h2>PDF를 올리면 뉴스레터 전시본을 만듭니다</h2>
            <p>{status}</p>
          </div>
          <label className={isBusy ? "drop disabled" : "drop"}>
            <FileUp size={42} />
            <strong>PDF 선택</strong>
            <span>승인 전까지 원본 PDF는 서버에 저장하지 않습니다.</span>
            <input type="file" accept="application/pdf" disabled={isBusy} onChange={(event) => handleFile(event.target.files?.[0])} />
          </label>
          {extracted && (
            <div className="approval-row">
              <button className="primary" type="button" disabled={isBusy} onClick={handlePublish}><CheckCircle2 size={18} />최종 승인 및 게재</button>
              <button className="ghost" type="button" disabled={isBusy} onClick={() => setExtracted(null)}><Trash2 size={18} />미리보기 삭제</button>
            </div>
          )}
        </div>

        <AccountPanel
          session={session}
          isAdmin={isAdmin}
          canApproveUsers={canApproveUsers}
          users={users}
          pendingUsers={pendingUsers}
          approvedUsers={approvedUsers}
          passwordRequests={passwordRequests}
          subadminCount={subadminCount}
          changeForm={changeForm}
          setChangeForm={setChangeForm}
          visiblePasswords={visiblePasswords}
          togglePassword={togglePassword}
          onChangePasscode={handleChangePasscode}
          onApproveUser={approveUser}
          onExpelUser={expelUser}
          onSetSubadmin={setSubadmin}
          onClearRequest={clearPasswordRequest}
          realtimeDatabaseReady={realtimeDatabaseReady}
        />
      </section>

      <section id="newsletter" className="reader-layout"><NewsletterView issue={previewIssue} /></section>

      <section id="archive" className="archive">
        <div className="section-title">
          <div><span className="eyebrow"><Archive size={16} /> 기록실</span><h2>지난 뉴스레터 보기</h2></div>
          <label className="search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="호수, 월, 제목 검색" /></label>
        </div>
        <div className="issue-grid">
          {filteredIssues.length === 0 && <p className="empty">아직 기록된 뉴스레터가 없습니다. PDF를 게재하면 이곳에 쌓입니다.</p>}
          {filteredIssues.map((issue) => (
            <article key={issue.id} className="issue-card">
              <button type="button" onClick={() => setActiveIssue(issue)}><BookOpenText size={24} /><strong>{issue.title}</strong><span>{issue.edition} · {issue.monthLabel}</span></button>
              {isAdmin && <button className="icon-danger" type="button" onClick={() => handleRemove(issue)} aria-label={`${issue.title} 삭제`}><Trash2 size={18} /></button>}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function AuthGate(props) {
  const {
    authMode, setAuthMode, authMessage, loginForm, setLoginForm, signupForm, setSignupForm,
    forgotName, setForgotName, visiblePasswords, togglePassword, onLogin, onSignup, onForgotRequest,
  } = props;
  return (
    <main className="auth-shell">
      <section className="auth-hero">
        <img src="/assets/ps1-logo.jpg" alt="PS1 로고" />
        <p>PKNU Social Welfare · Private Newsletter Studio</p>
        <h1>PS1 NEWS NETTER</h1>
        <span>가입 신청 후 승인된 사용자와 관리자만 입장할 수 있습니다.</span>
      </section>
      <section className="auth-card">
        <div className="auth-tabs">
          <button className={authMode === "login" ? "active" : ""} type="button" onClick={() => setAuthMode("login")}><LogIn size={17} />로그인</button>
          <button className={authMode === "signup" ? "active" : ""} type="button" onClick={() => setAuthMode("signup")}><UserPlus size={17} />신규가입</button>
          <button className={authMode === "forgot" ? "active" : ""} type="button" onClick={() => setAuthMode("forgot")}><KeyRound size={17} />비밀번호 찾기</button>
        </div>
        {authMode === "login" && (
          <form className="auth-form" onSubmit={onLogin}>
            <span className="eyebrow"><Lock size={16} /> 로그인 안내</span>
            <h2>이름과 비밀번호로 입장</h2>
            <p>{PASSCODE_NOTICE} 관리자 기본값은 이름 `PKNUNEWS`, 비밀번호 `50321004`입니다.</p>
            <input value={loginForm.name} onChange={(event) => setLoginForm({ ...loginForm, name: event.target.value })} placeholder="이름" />
            <PasswordField value={loginForm.passcode} onChange={(value) => setLoginForm({ ...loginForm, passcode: value })} visible={visiblePasswords.login} onToggle={() => togglePassword("login")} placeholder="숫자 8자리 비밀번호" />
            <button className="primary" type="submit">입장하기</button>
          </form>
        )}
        {authMode === "signup" && (
          <form className="auth-form" onSubmit={onSignup}>
            <span className="eyebrow"><UserPlus size={16} /> 신규가입 안내</span>
            <h2>사용자 등록</h2>
            <p>{PASSCODE_NOTICE} 가입 후 관리자 또는 부관리자 승인을 받아야 이용할 수 있습니다.</p>
            <input value={signupForm.name} onChange={(event) => setSignupForm({ ...signupForm, name: event.target.value })} placeholder="이름" />
            <select value={signupForm.studentYear} onChange={(event) => setSignupForm({ ...signupForm, studentYear: event.target.value })}>
              {STUDENT_YEARS.map((year) => <option key={year} value={year}>{year}학번</option>)}
            </select>
            <PasswordField value={signupForm.passcode} onChange={(value) => setSignupForm({ ...signupForm, passcode: value })} visible={visiblePasswords.signup} onToggle={() => togglePassword("signup")} placeholder="숫자 8자리 비밀번호" />
            <PasswordField value={signupForm.confirmPasscode} onChange={(value) => setSignupForm({ ...signupForm, confirmPasscode: value })} visible={visiblePasswords.signupConfirm} onToggle={() => togglePassword("signupConfirm")} placeholder="비밀번호 확인" />
            <button className="primary" type="submit">가입 신청</button>
          </form>
        )}
        {authMode === "forgot" && (
          <form className="auth-form" onSubmit={onForgotRequest}>
            <span className="eyebrow"><KeyRound size={16} /> 비밀번호 찾기</span>
            <h2>관리자에게 확인 요청</h2>
            <p>요청을 보낸 가입자의 비밀번호만 관리자가 확인할 수 있습니다.</p>
            <input value={forgotName} onChange={(event) => setForgotName(event.target.value)} placeholder="가입한 이름" />
            <button className="primary" type="submit">관리자에게 요청 보내기</button>
          </form>
        )}
        {authMessage && <p className="auth-message">{authMessage}</p>}
      </section>
    </main>
  );
}

function AccountPanel(props) {
  const {
    session, isAdmin, canApproveUsers, users, pendingUsers, approvedUsers, passwordRequests, subadminCount,
    changeForm, setChangeForm, visiblePasswords, togglePassword, onChangePasscode, onApproveUser,
    onExpelUser, onSetSubadmin, onClearRequest, realtimeDatabaseReady,
  } = props;
  return (
    <aside id="account" className="login-box account-panel">
      <span className="eyebrow"><UserRound size={16} /> 계정</span>
      <h3>{session.name}</h3>
      <p>{session.studentYear} · {roleLabel(session.role)}</p>
      <span className="muted">{realtimeDatabaseReady ? "Realtime Database 연결됨" : "로컬 저장 모드"}</span>

      <form className="mini-form" onSubmit={onChangePasscode}>
        <strong>비밀번호 변경</strong>
        <p>{PASSCODE_NOTICE} 기존 비밀번호 확인 후 새 비밀번호를 두 번 입력합니다.</p>
        <PasswordField value={changeForm.currentPasscode} onChange={(value) => setChangeForm({ ...changeForm, currentPasscode: value })} visible={visiblePasswords.changeCurrent} onToggle={() => togglePassword("changeCurrent")} placeholder="기존 비밀번호" />
        <PasswordField value={changeForm.nextPasscode} onChange={(value) => setChangeForm({ ...changeForm, nextPasscode: value })} visible={visiblePasswords.changeNext} onToggle={() => togglePassword("changeNext")} placeholder="새 비밀번호" />
        <PasswordField value={changeForm.confirmPasscode} onChange={(value) => setChangeForm({ ...changeForm, confirmPasscode: value })} visible={visiblePasswords.changeConfirm} onToggle={() => togglePassword("changeConfirm")} placeholder="새 비밀번호 확인" />
        <button className="ghost" type="submit">변경하기</button>
      </form>

      {canApproveUsers && (
        <div className="request-box">
          <strong>가입 승인 대기</strong>
          <p>관리자와 부관리자만 가입자를 승인할 수 있습니다.</p>
          {pendingUsers.length === 0 && <span className="muted">승인 대기자가 없습니다.</span>}
          {pendingUsers.map((user) => (
            <div className="request-item" key={user.id}>
              <span>{user.name} · {user.studentYear}학번</span>
              <button type="button" onClick={() => onApproveUser(user.id)}><UserCheck size={16} /> 승인</button>
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <div className="request-box">
          <strong>사용자 관리</strong>
          <p>강제 탈퇴는 관리자만 가능합니다. 부관리자는 최대 3명입니다. 현재 {subadminCount}명.</p>
          {approvedUsers.length === 0 && <span className="muted">승인된 가입자가 없습니다.</span>}
          {approvedUsers.map((user) => (
            <div className="request-item" key={user.id}>
              <span>{user.name} · {user.studentYear}학번 · {roleLabel(user.role)}</span>
              <button type="button" onClick={() => onSetSubadmin(user.id, user.role !== "subadmin")}>
                {user.role === "subadmin" ? "부관리자 해제" : "부관리자 지정"}
              </button>
              <button type="button" className="danger-inline" onClick={() => onExpelUser(user.id)}>강제 탈퇴</button>
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <div className="request-box">
          <strong>비밀번호 확인 요청</strong>
          <p>요청한 가입자의 비밀번호만 표시됩니다.</p>
          {passwordRequests.length === 0 && <span className="muted">현재 요청이 없습니다.</span>}
          {passwordRequests.map((user) => (
            <div className="request-item" key={user.id}>
              <span>{user.name} · {user.studentYear}학번</span>
              <code>{user.passcode}</code>
              <button type="button" onClick={() => onClearRequest(user.id)}>처리 완료</button>
            </div>
          ))}
          <span className="muted">전체 가입자 {users.length}명</span>
        </div>
      )}
    </aside>
  );
}

function PasswordField({ value, onChange, visible, onToggle, placeholder }) {
  return (
    <label className="password-field">
      <input type={visible ? "text" : "password"} inputMode="numeric" maxLength={8} value={value} onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 8))} placeholder={placeholder} />
      <button type="button" onClick={onToggle} aria-label={visible ? "비밀번호 숨기기" : "비밀번호 보기"}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
    </label>
  );
}

function NewsletterView({ issue }) {
  return (
    <article className="newsletter">
      <div className="masthead"><span>{issue.monthLabel}</span><h2>{issue.title}</h2><p>{issue.summary}</p></div>
      <div className="section-nav">
        {SECTION_DEFS.map((section) => {
          const Icon = section.icon;
          return <a key={section.key} href={`#${section.key}`}><Icon size={17} />{section.label}</a>;
        })}
      </div>
      <div className="content-grid">
        {SECTION_DEFS.map((section) => {
          const Icon = section.icon;
          const content = issue.sections?.[section.key] || [];
          return (
            <section key={section.key} id={section.key} className="news-section">
              <div className="section-label"><Icon size={22} /><h3>{section.label}</h3></div>
              {section.key === "calendar" ? <EventList events={issue.events} /> : (
                <div className="story-list">
                  {content.slice(0, 4).map((text, index) => <p key={`${section.key}-${index}`}>{text}</p>)}
                  {content.length === 0 && <p>PDF에서 이 영역의 내용을 찾으면 자동으로 여기에 정리됩니다.</p>}
                </div>
              )}
            </section>
          );
        })}
      </div>
      <div className="pages">
        <div className="section-label"><Download size={22} /><h3>PDF 전시 이미지</h3></div>
        <div className="page-strip">
          {(issue.pages || []).slice(0, 8).map((page) => (
            <figure key={page.number}><img src={page.url} alt={`${issue.title} ${page.number}쪽`} loading="lazy" /><figcaption>{page.number}쪽 · {formatBytes(page.size)}</figcaption></figure>
          ))}
        </div>
      </div>
    </article>
  );
}

function EventList({ events = SAMPLE_EVENTS }) {
  return <div className="event-list">{events.map((event, index) => <div key={`${event.date}-${index}`}><time>{event.date}</time><span>{event.title}</span></div>)}</div>;
}

async function extractNewsletter(file, updateStatus) {
  const pdfjsLib = await import("pdfjs-dist");
  const pdfWorker = await import("pdfjs-dist/build/pdf.worker.mjs?url");
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker.default;
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];
  const texts = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    updateStatus(`${pdf.numPages}쪽 중 ${pageNumber}쪽을 읽는 중입니다.`);
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    texts.push(textContent.items.map((item) => item.str).join(" "));
    pages.push(await renderCompressedPage(page, pageNumber));
  }
  const fullText = normalizeText(texts.join("\n"));
  return {
    title: guessTitle(fullText),
    edition: guessEdition(fullText, file.name),
    monthLabel: guessMonthLabel(fullText),
    summary: makeSummary(fullText),
    sections: classifySections(fullText),
    events: extractEvents(fullText),
    pages,
    sourceFileName: file.name,
  };
}

async function renderCompressedPage(page, pageNumber) {
  const viewport = page.getViewport({ scale: 1.15 });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvasContext: context, viewport }).promise;
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.72));
  return { number: pageNumber, url: URL.createObjectURL(blob), blob, width: canvas.width, height: canvas.height };
}

function validatePasscodePair(passcode, confirmPasscode) {
  if (!/^\d{8}$/.test(passcode)) return "비밀번호는 숫자 8자리여야 합니다.";
  if (passcode !== confirmPasscode) return "비밀번호 확인이 일치하지 않습니다.";
  return "";
}

function readUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || "[]").map((user) => ({
      ...user,
      role: user.role || "user",
      approved: Boolean(user.approved),
    }));
  } catch {
    return [];
  }
}

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function roleLabel(role) {
  if (role === "admin") return "관리자";
  if (role === "subadmin") return "부관리자";
  return "가입자";
}

function normalizeText(text) {
  return text.replace(/\s+/g, " ").replace(/([.!?。])\s/g, "$1\n").trim();
}

function guessTitle(text) {
  const firstLine = text.split("\n").find((line) => line.length > 8 && line.length < 80);
  if (firstLine?.includes("PS1")) return firstLine;
  return "PS1 NEWS LETTER";
}

function guessEdition(text, fileName) {
  const edition = text.match(/(?:제\s*)?\d+\s*호|vol\.?\s*\d+|no\.?\s*\d+/i)?.[0];
  if (edition) return edition.replace(/\s+/g, " ");
  const fileEdition = fileName.match(/\d{1,3}/)?.[0];
  return fileEdition ? `제${fileEdition}호` : "새 뉴스레터";
}

function guessMonthLabel(text) {
  const match = text.match(/20\d{2}\s*[.\-/년]\s*\d{1,2}\s*(?:월)?/);
  if (match) return match[0].replace(/\s+/g, " ");
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long" }).format(new Date());
}

function makeSummary(text) {
  const sentences = text.split(/[.!?。]\s*/).filter((sentence) => sentence.length > 18);
  return (sentences.slice(0, 2).join(". ") || "이번 호의 주요 소식과 전공 일정을 한눈에 볼 수 있습니다.").slice(0, 220);
}

function classifySections(text) {
  const sentences = text.split(/[.!?。]\s*/).map((item) => item.trim()).filter((item) => item.length > 16);
  return Object.fromEntries(SECTION_DEFS.map((section) => [section.key, sentences.filter((sentence) => section.hints.some((hint) => sentence.includes(hint))).slice(0, 5)]));
}

function extractEvents(text) {
  const matches = [...text.matchAll(/(\d{1,2}[./]\d{1,2})\s*([^.\n]{4,36})/g)];
  const events = matches.slice(0, 6).map((match) => ({ date: match[1].replace("/", "."), title: match[2].trim() }));
  return events.length ? events : SAMPLE_EVENTS;
}

function createWelcomeIssue() {
  return {
    title: "PS1 NEWS LETTER",
    edition: "운영 준비호",
    monthLabel: "PDF 게재 대기",
    summary: "사복뉴스페이퍼 PDF를 첨부하면 전공소식, 교수동정, 대학원 소식, 월별 전공 일정, 인터뷰, 사회복지 정보통으로 나누어 전시합니다.",
    sections: {
      major: ["학부생을 위한 전공 행사, 장학, 비교과, 모집 공지를 정리합니다."],
      faculty: ["교수님의 연구, 학회, 수상, 언론 기고 등 주요 동정을 모읍니다."],
      graduate: ["일반대학원과 글로벌정책대학원의 학사 및 연구 소식을 담습니다."],
      interview: ["재학생, 동문, 교수님을 만나는 복 들어오는 인터뷰 영역입니다."],
      info: ["알기 쉬운 사회복지 정책과 제도 정보를 카드형으로 제공합니다."],
    },
    events: SAMPLE_EVENTS,
    pages: [],
  };
}

function formatBytes(size = 0) {
  if (!size) return "압축됨";
  if (size < 1024) return `${size}B`;
  return `${Math.round(size / 1024)}KB`;
}
