import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  BookOpenText,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  FileUp,
  KeyRound,
  LogIn,
  LogOut,
  PanelTop,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
  UserRound,
} from "lucide-react";
import { listIssues, listUsers, publishIssue, realtimeDatabaseReady, removeIssue, saveUsers } from "./firebase.js";

const ADMIN_ACCOUNT = {
  name: "PKNUNEWS",
  passcode: "50321004",
  role: "admin",
  studentYear: "주 제작자",
  approved: true,
};

const USERS_KEY = "ps1-news-netter-users";
const SESSION_KEY = "ps1-news-netter-session";
const PASSCODE_NOTICE = "비밀번호는 숫자 8자리입니다.";
const SUBADMIN_LIMIT = 3;
const STUDENT_YEARS = Array.from({ length: 41 }, (_, index) => String(2010 + index));

export default function App() {
  const [session, setSession] = useState(() => readSession());
  const [authMode, setAuthMode] = useState(null);
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
  const [status, setStatus] = useState("제작자는 PDF를 첨부해 뉴스레터 전시본을 만들 수 있습니다.");
  const [isBusy, setIsBusy] = useState(false);
  const [isDraggingPdf, setIsDraggingPdf] = useState(false);
  const [query, setQuery] = useState("");

  const isAdmin = session?.role === "admin";
  const canApproveUsers = session?.role === "admin" || session?.role === "subadmin";
  const canUseStudio = Boolean(session?.approved);
  const pendingUsers = users.filter((user) => !user.approved);
  const approvedUsers = users.filter((user) => user.approved);
  const passwordRequests = users.filter((user) => user.resetRequested);
  const subadminCount = users.filter((user) => user.role === "subadmin").length;

  useEffect(() => {
    refreshIssues();
    loadUsers();
  }, []);

  useEffect(() => {
    if (!usersLoaded) return;
    saveUsers(users).catch((error) => setStatus(`제작자 정보를 저장하지 못했습니다: ${error.message}`));
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

  function openAuth(mode) {
    setAuthMode(mode);
    setAuthMessage("");
  }

  function togglePassword(key) {
    setVisiblePasswords((current) => ({ ...current, [key]: !current[key] }));
  }

  function handleSignup(event) {
    event.preventDefault();
    const name = signupForm.name.trim();
    const validation = validatePasscodePair(signupForm.passcode, signupForm.confirmPasscode);
    if (!name) return setAuthMessage("이름을 입력해주세요.");
    if (name === ADMIN_ACCOUNT.name || users.some((user) => user.name === name)) return setAuthMessage("이미 신청된 이름입니다.");
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
    setAuthMessage("제작자 가입 신청이 완료되었습니다. 주 제작자 또는 부 제작자 승인 후 제작실을 이용할 수 있습니다.");
    setAuthMode("login");
    setSignupForm({ name: "", studentYear: "2025", passcode: "", confirmPasscode: "" });
  }

  function handleLogin(event) {
    event.preventDefault();
    const name = loginForm.name.trim();
    const passcode = loginForm.passcode.trim();
    const account = name === ADMIN_ACCOUNT.name ? ADMIN_ACCOUNT : users.find((user) => user.name === name);
    if (!account || account.passcode !== passcode) return setAuthMessage("이름 또는 비밀번호가 맞지 않습니다.");
    if (!account.approved) return setAuthMessage("아직 승인 대기 중입니다. 공개 뉴스레터는 볼 수 있지만 제작실은 승인 후 이용할 수 있습니다.");

    const nextSession = {
      id: account.id || "admin",
      name: account.name,
      role: account.role,
      studentYear: account.studentYear,
      approved: true,
      signedInAt: new Date().toISOString(),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
    setAuthMode(null);
    setAuthMessage("");
  }

  function handleLogout() {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setLoginForm({ name: "", passcode: "" });
  }

  function approveUser(userId) {
    if (!canApproveUsers) return;
    setUsers((current) => current.map((user) => (user.id === userId ? { ...user, approved: true, approvedAt: new Date().toISOString() } : user)));
    setStatus("제작자를 승인했습니다.");
  }

  function expelUser(userId) {
    if (!isAdmin) return;
    setUsers((current) => current.filter((user) => user.id !== userId));
    setStatus("선택한 제작자를 강제 탈퇴시켰습니다.");
  }

  function setSubadmin(userId, enabled) {
    if (!isAdmin) return;
    if (enabled && subadminCount >= SUBADMIN_LIMIT) return setStatus(`부 제작자는 최대 ${SUBADMIN_LIMIT}명까지 지정할 수 있습니다.`);
    setUsers((current) => current.map((user) => (user.id === userId ? { ...user, role: enabled ? "subadmin" : "user", approved: true } : user)));
    setStatus(enabled ? "부 제작자로 지정했습니다." : "부 제작자 지정을 해제했습니다.");
  }

  function handleChangePasscode(event) {
    event.preventDefault();
    const validation = validatePasscodePair(changeForm.nextPasscode, changeForm.confirmPasscode);
    if (validation) return setStatus(validation);
    if (isAdmin) {
      if (changeForm.currentPasscode !== ADMIN_ACCOUNT.passcode) return setStatus("기존 주 제작자 비밀번호가 맞지 않습니다.");
      return setStatus("기본 주 제작자 비밀번호는 코드에 고정되어 있어 이 화면에서는 변경하지 않습니다.");
    }
    const target = users.find((user) => user.name === session.name);
    if (!target || target.passcode !== changeForm.currentPasscode) return setStatus("기존 비밀번호가 맞지 않습니다.");
    setUsers((current) =>
      current.map((user) =>
        user.id === target.id ? { ...user, passcode: changeForm.nextPasscode, resetRequested: false, updatedAt: new Date().toISOString() } : user,
      ),
    );
    setChangeForm({ currentPasscode: "", nextPasscode: "", confirmPasscode: "" });
    setStatus("비밀번호가 변경되었습니다.");
  }

  function handleForgotRequest(event) {
    event.preventDefault();
    const target = users.find((user) => user.name === forgotName.trim());
    if (!target) return setAuthMessage("신청된 이름을 찾지 못했습니다.");
    setUsers((current) => current.map((user) => (user.id === target.id ? { ...user, resetRequested: true, requestedAt: new Date().toISOString() } : user)));
    setForgotName("");
    setAuthMessage("비밀번호 확인 요청을 보냈습니다. 주 제작자에게 문의해주세요.");
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
      setStatus(`Realtime Database 제작자 정보를 불러오지 못했습니다: ${error.message}`);
    } finally {
      setUsersLoaded(true);
    }
  }

  async function handleFile(file) {
    if (!file || !canUseStudio) return;
    if (file.type && file.type !== "application/pdf") {
      setStatus("PDF 파일만 첨부할 수 있습니다.");
      return;
    }
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

  function handlePdfDrag(event, dragging) {
    event.preventDefault();
    event.stopPropagation();
    if (!isBusy) setIsDraggingPdf(dragging);
  }

  function handlePdfDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingPdf(false);
    handleFile(event.dataTransfer.files?.[0]);
  }

  async function handlePublish() {
    if (!extracted || !canUseStudio) return;
    setIsBusy(true);
    setStatus("게재 중입니다. 원본 PDF는 저장하지 않고 압축된 전시 이미지와 요약 데이터만 보관합니다.");
    try {
      await publishIssue(extracted);
      setExtracted(null);
      await refreshIssues();
      setStatus("게재가 완료되었습니다. 공개 뉴스레터 화면에 반영됩니다.");
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

  return (
    <main className="site-shell public-shell">
      <header className="topbar">
        <a className="brand" href="#newsletter" aria-label="PS1 NEWS NETTER 홈">
          <img src="/assets/ps1-logo.jpg" alt="PS1 로고" />
          <span>
            <strong>PS1 NEWS NETTER</strong>
            <small>사회복지학전공 공개 뉴스레터</small>
          </span>
        </a>
        <nav>
          <a href="#newsletter">뉴스레터</a>
          <a href="#archive">지난 뉴스레터 보기</a>
          {canUseStudio && <a href="#studio">제작실</a>}
          {session ? (
            <button className="nav-button" type="button" onClick={handleLogout}><LogOut size={16} />로그아웃</button>
          ) : (
            <>
              <button className="nav-button compact-auth" type="button" onClick={() => openAuth("login")}>로그인</button>
              <button className="nav-button compact-auth" type="button" onClick={() => openAuth("signup")}>신규가입</button>
            </>
          )}
        </nav>
      </header>

      {authMode && !session && (
        <CompactAuthPanel
          authMode={authMode}
          setAuthMode={setAuthMode}
          close={() => setAuthMode(null)}
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
      )}

      <section id="newsletter" className="reader-layout">
        <NewsletterView issue={previewIssue} />
      </section>

      <section id="archive" className="archive">
        <div className="section-title">
          <div><span className="eyebrow"><Archive size={16} /> 기록실</span><h2>지난 뉴스레터 보기</h2></div>
          <label className="search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="호수, 월, 제목 검색" /></label>
        </div>
        <div className="issue-grid">
          {filteredIssues.length === 0 && <p className="empty">아직 기록된 뉴스레터가 없습니다. 제작자가 PDF를 게재하면 이곳에 쌓입니다.</p>}
          {filteredIssues.map((issue) => (
            <article key={issue.id} className="issue-card">
              <button type="button" onClick={() => setActiveIssue(issue)}><BookOpenText size={24} /><strong>{issue.title}</strong><span>{issue.edition} · {issue.monthLabel}</span></button>
              {isAdmin && <button className="icon-danger" type="button" onClick={() => handleRemove(issue)} aria-label={`${issue.title} 삭제`}><Trash2 size={18} /></button>}
            </article>
          ))}
        </div>
      </section>

      {canUseStudio && (
        <section id="studio" className="studio-section">
          <div className="section-title">
            <div><span className="eyebrow"><Sparkles size={16} /> 제작실</span><h2>제작자 뉴스레터 작업대</h2></div>
            <span className="producer-badge">{session.name} · {roleLabel(session.role)}</span>
          </div>
          <div className="operations" aria-label="제작 방식">
            <article><FileUp size={22} /><strong>PDF 첨부</strong><span>승인된 제작자는 뉴스레터 전시본을 만들 수 있습니다.</span></article>
            <article><PanelTop size={22} /><strong>자동 전시</strong><span>텍스트를 영역별로 정리하고 페이지 이미지를 압축합니다.</span></article>
            <article><ShieldCheck size={22} /><strong>공개 게재</strong><span>게재 후 URL을 아는 누구나 볼 수 있습니다.</span></article>
          </div>
          <section className="admin-layout">
            <div className="upload-zone">
              <div>
                <span className="eyebrow"><Newspaper size={16} /> PDF 제작</span>
                <h2>PDF를 올리면 공개 뉴스레터 전시본을 만듭니다</h2>
                <p>{status}</p>
              </div>
              <label
                className={`${isBusy ? "drop disabled" : "drop"}${isDraggingPdf ? " dragging" : ""}`}
                onDragEnter={(event) => handlePdfDrag(event, true)}
                onDragOver={(event) => handlePdfDrag(event, true)}
                onDragLeave={(event) => handlePdfDrag(event, false)}
                onDrop={handlePdfDrop}
              >
                <FileUp size={42} />
                <strong>PDF 선택</strong>
                <span>클릭하거나 PDF 파일을 이 영역으로 드래그하세요. 승인 전까지 원본 PDF는 서버에 저장하지 않습니다.</span>
                <input type="file" accept="application/pdf" disabled={isBusy} onChange={(event) => handleFile(event.target.files?.[0])} />
              </label>
              {extracted && (
                <div className="approval-row">
                  <button className="primary" type="button" disabled={isBusy} onClick={handlePublish}><CheckCircle2 size={18} />최종 승인 및 공개 게재</button>
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
        </section>
      )}
    </main>
  );
}

function CompactAuthPanel(props) {
  const { authMode, setAuthMode, close, authMessage, loginForm, setLoginForm, signupForm, setSignupForm, forgotName, setForgotName, visiblePasswords, togglePassword, onLogin, onSignup, onForgotRequest } = props;
  return (
    <section className="compact-auth-panel">
      <div className="auth-tabs">
        <button className={authMode === "login" ? "active" : ""} type="button" onClick={() => setAuthMode("login")}><LogIn size={16} />로그인</button>
        <button className={authMode === "signup" ? "active" : ""} type="button" onClick={() => setAuthMode("signup")}><UserPlus size={16} />신규가입</button>
        <button className={authMode === "forgot" ? "active" : ""} type="button" onClick={() => setAuthMode("forgot")}><KeyRound size={16} />비밀번호 찾기</button>
        <button type="button" onClick={close}>닫기</button>
      </div>
      {authMode === "login" && (
        <form className="auth-form compact" onSubmit={onLogin}>
          <input value={loginForm.name} onChange={(event) => setLoginForm({ ...loginForm, name: event.target.value })} placeholder="이름" />
          <PasswordField value={loginForm.passcode} onChange={(value) => setLoginForm({ ...loginForm, passcode: value })} visible={visiblePasswords.login} onToggle={() => togglePassword("login")} placeholder="숫자 8자리 비밀번호" />
          <button className="primary" type="submit">제작실 입장</button>
        </form>
      )}
      {authMode === "signup" && (
        <form className="auth-form compact" onSubmit={onSignup}>
          <span className="eyebrow"><UserPlus size={16} /> 제작자 신규가입</span>
          <p>{PASSCODE_NOTICE} 신청 후 주 제작자 또는 부 제작자 승인이 필요합니다.</p>
          <input value={signupForm.name} onChange={(event) => setSignupForm({ ...signupForm, name: event.target.value })} placeholder="이름" />
          <select value={signupForm.studentYear} onChange={(event) => setSignupForm({ ...signupForm, studentYear: event.target.value })}>{STUDENT_YEARS.map((year) => <option key={year} value={year}>{year}학번</option>)}</select>
          <PasswordField value={signupForm.passcode} onChange={(value) => setSignupForm({ ...signupForm, passcode: value })} visible={visiblePasswords.signup} onToggle={() => togglePassword("signup")} placeholder="숫자 8자리 비밀번호" />
          <PasswordField value={signupForm.confirmPasscode} onChange={(value) => setSignupForm({ ...signupForm, confirmPasscode: value })} visible={visiblePasswords.signupConfirm} onToggle={() => togglePassword("signupConfirm")} placeholder="비밀번호 확인" />
          <button className="primary" type="submit">제작자 신청</button>
        </form>
      )}
      {authMode === "forgot" && (
        <form className="auth-form compact" onSubmit={onForgotRequest}>
          <span className="eyebrow"><KeyRound size={16} /> 비밀번호 찾기</span>
          <p>요청을 보낸 제작자의 비밀번호만 주 제작자가 확인할 수 있습니다.</p>
          <input value={forgotName} onChange={(event) => setForgotName(event.target.value)} placeholder="신청한 이름" />
          <button className="primary" type="submit">확인 요청 보내기</button>
        </form>
      )}
      {authMessage && <p className="auth-message">{authMessage}</p>}
    </section>
  );
}

function AccountPanel(props) {
  const { session, isAdmin, canApproveUsers, users, pendingUsers, approvedUsers, passwordRequests, subadminCount, changeForm, setChangeForm, visiblePasswords, togglePassword, onChangePasscode, onApproveUser, onExpelUser, onSetSubadmin, onClearRequest, realtimeDatabaseReady } = props;
  return (
    <aside id="account" className="login-box account-panel">
      <span className="eyebrow"><UserRound size={16} /> 제작자 계정</span>
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
          <strong>제작자 승인 대기</strong>
          <p>주 제작자와 부 제작자만 공동제작자를 승인할 수 있습니다.</p>
          {pendingUsers.length === 0 && <span className="muted">승인 대기자가 없습니다.</span>}
          {pendingUsers.map((user) => <div className="request-item" key={user.id}><span>{user.name} · {user.studentYear}학번</span><button type="button" onClick={() => onApproveUser(user.id)}><UserCheck size={16} /> 승인</button></div>)}
        </div>
      )}

      {isAdmin && (
        <div className="request-box">
          <strong>제작자 관리</strong>
          <p>강제 탈퇴는 주 제작자만 가능합니다. 부 제작자는 최대 3명입니다. 현재 {subadminCount}명.</p>
          {approvedUsers.length === 0 && <span className="muted">승인된 공동제작자가 없습니다.</span>}
          {approvedUsers.map((user) => (
            <div className="request-item" key={user.id}>
              <span>{user.name} · {user.studentYear}학번 · {roleLabel(user.role)}</span>
              <button type="button" onClick={() => onSetSubadmin(user.id, user.role !== "subadmin")}>{user.role === "subadmin" ? "부 제작자 해제" : "부 제작자 지정"}</button>
              <button type="button" className="danger-inline" onClick={() => onExpelUser(user.id)}>강제 탈퇴</button>
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <div className="request-box">
          <strong>비밀번호 확인 요청</strong>
          <p>요청한 제작자의 비밀번호만 표시됩니다.</p>
          {passwordRequests.length === 0 && <span className="muted">현재 요청이 없습니다.</span>}
          {passwordRequests.map((user) => <div className="request-item" key={user.id}><span>{user.name} · {user.studentYear}학번</span><code>{user.passcode}</code><button type="button" onClick={() => onClearRequest(user.id)}>처리 완료</button></div>)}
          <span className="muted">전체 제작자 {users.length}명</span>
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
  const [zoomedPage, setZoomedPage] = useState(null);
  return (
    <article className="newsletter">
      <div className="masthead"><span>{issue.monthLabel}</span><h2>{issue.title}</h2><p>PDF 이미지를 아래로 내리면서 볼 수 있습니다.</p></div>
      <div className="pdf-scroll">
        {issue.pages?.length ? (
          issue.pages.map((page) => (
            <button className="pdf-page" type="button" key={page.number} onClick={() => setZoomedPage(page)}>
              <img
                src={page.url}
                alt={`${issue.title} ${page.number}쪽`}
                loading="lazy"
                onError={(event) => event.currentTarget.closest(".pdf-page")?.classList.add("image-error")}
              />
              <em className="page-fallback">이미지를 다시 게재해야 합니다</em>
            </button>
          ))
        ) : (
          <div className="empty-pdf">
            <Download size={28} />
            <strong>아직 게재된 PDF 이미지가 없습니다.</strong>
          </div>
        )}
      </div>
      {zoomedPage && <div className="page-modal" role="dialog" aria-modal="true" aria-label={`${zoomedPage.number}쪽 확대 보기`} onClick={() => setZoomedPage(null)}><div className="page-modal-inner" onClick={(event) => event.stopPropagation()}><button className="modal-close" type="button" onClick={() => setZoomedPage(null)}>닫기</button><img src={zoomedPage.url} alt={`${issue.title} ${zoomedPage.number}쪽 확대`} /></div></div>}
    </article>
  );
}

async function extractNewsletter(file, updateStatus) {
  const pdfjsLib = await import("pdfjs-dist");
  const pdfWorker = await import("pdfjs-dist/build/pdf.worker.mjs?url");
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker.default;
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: data.slice(0) }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    updateStatus(`${pdf.numPages}쪽 중 ${pageNumber}쪽을 이미지로 만드는 중입니다.`);
    const page = await pdf.getPage(pageNumber);
    pages.push(await renderCompressedPage(page, pageNumber));
  }
  return { title: "PS1 NEWS LETTER", edition: guessEdition(file.name), monthLabel: guessMonthLabel(), summary: "", sections: {}, events: [], pages, sourceFileName: file.name, pageCount: pdf.numPages };
}

async function renderCompressedPage(page, pageNumber) {
  const canvas = await renderPageCanvas(page, 1.15);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.72));
  const url = await blobToDataUrl(blob);
  const result = { number: pageNumber, url, blob, size: blob?.size || 0, width: canvas.width, height: canvas.height };
  canvas.width = 1;
  canvas.height = 1;
  return result;
}

async function renderPageCanvas(page, scale) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function validatePasscodePair(passcode, confirmPasscode) {
  if (!/^\d{8}$/.test(passcode)) return "비밀번호는 숫자 8자리여야 합니다.";
  if (passcode !== confirmPasscode) return "비밀번호 확인이 일치하지 않습니다.";
  return "";
}

function readUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || "[]").map((user) => ({ ...user, role: user.role || "user", approved: Boolean(user.approved) }));
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
  if (role === "admin") return "주 제작자";
  if (role === "subadmin") return "부 제작자";
  return "공동제작자";
}

function guessEdition(fileName) {
  const edition = fileName.match(/(?:제\s*)?\d+\s*호|vol\.?\s*\d+|no\.?\s*\d+/i)?.[0];
  if (edition) return edition.replace(/\s+/g, " ");
  const fileEdition = fileName.match(/\d{1,3}/)?.[0];
  return fileEdition ? `제${fileEdition}호` : "새 뉴스레터";
}

function guessMonthLabel() {
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long" }).format(new Date());
}

function createWelcomeIssue() {
  return {
    title: "PS1 NEWS LETTER",
    edition: "PDF 게재 대기",
    monthLabel: "공개 뉴스레터",
    summary: "",
    sections: {},
    events: [],
    pages: [],
    pageCount: 0,
  };
}

function formatBytes(size = 0) {
  if (!size) return "압축됨";
  if (size < 1024) return `${size}B`;
  return `${Math.round(size / 1024)}KB`;
}
