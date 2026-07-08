const STORAGE_KEY = "rushcare.mobile.settings.v1";
const CACHE_KEY = "rushcare.mobile.cache.v1";
const SESSION_KEY = "rushcare.mobile.session.v1";
const DEFAULT_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyR3mD2MHpmjRoq8-wp5C3ooD08S7cF_rM2pG-rhRjKuqC8aHLUjJxUTOXyDXlHjPNd/exec";
const ADMIN_LOGIN = { username: "wbwl009", password: "5479", name: "관리자", role: "admin" };
const SESSION_HOURS = 24;
const todayISO = localDateISO(new Date());

let state = { customers: [], jobs: [], photos: [], technicians: [], vendors: [] };
let activeTab = "today";
let busy = false;

const $ = (selector) => document.querySelector(selector);
const els = {
  loginScreen: $("#loginScreen"), loginForm: $("#loginForm"), loginId: $("#loginId"),
  loginPassword: $("#loginPassword"), loginMessage: $("#loginMessage"), loginSubmit: $("#loginSubmit"),
  todayLabel: $("#todayLabel"), reloadBtn: $("#reloadBtn"), openSettings: $("#openSettings"),
  openJobDialog: $("#openJobDialog"), settingsDialog: $("#settingsDialog"), scriptUrlInput: $("#scriptUrlInput"),
  saveSettings: $("#saveSettings"), searchInput: $("#searchInput"), toast: $("#toast"),
  jobDialog: $("#jobDialog"), jobForm: $("#jobForm"), customerDialog: $("#customerDialog"),
  customerForm: $("#customerForm"), techDialog: $("#techDialog"), techForm: $("#techForm"),
  vendorDialog: $("#vendorDialog"), vendorForm: $("#vendorForm"), techOptions: $("#techOptions"),
  jobPhotoInput: $("#jobPhotoInput"), jobPhotoList: $("#jobPhotoList"),
  metricToday: $("#metricToday"), metricActive: $("#metricActive"), metricRevenue: $("#metricRevenue"),
  metricOutsourceFee: $("#metricOutsourceFee"),
  metricUnpaid: $("#metricUnpaid"), todayCount: $("#todayCount"), jobsCount: $("#jobsCount"),
  customersCount: $("#customersCount"), paymentsCount: $("#paymentsCount"), techsCount: $("#techsCount"),
  vendorsCount: $("#vendorsCount"), todayList: $("#todayList"), jobsList: $("#jobsList"),
  customersList: $("#customersList"), paymentsList: $("#paymentsList"), techsList: $("#techsList"),
  vendorsList: $("#vendorsList")
};

init();

function init() {
  registerServiceWorker();
  els.todayLabel.textContent = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric", month: "long", day: "numeric", weekday: "short"
  }).format(new Date());
  els.scriptUrlInput.value = getSettings().scriptUrl || "";
  const cached = loadCache();
  if (cached) state = normalizeData(cached);
  bindEvents();
  render();
  const session = loadSession();
  if (session) completeLogin(session.user);
  else els.loginId.focus();
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}

function bindEvents() {
  els.loginForm.addEventListener("submit", login);
  els.reloadBtn.addEventListener("click", loadFromDb);
  els.openSettings.addEventListener("click", () => els.settingsDialog.showModal());
  els.openJobDialog.addEventListener("click", () => openJobDialog());
  $("#closeJobDialog").addEventListener("click", () => els.jobDialog.close());
  els.jobForm.addEventListener("submit", submitJob);
  els.customerForm.addEventListener("submit", submitCustomer);
  els.techForm.addEventListener("submit", submitTech);
  els.vendorForm.addEventListener("submit", submitVendor);
  $("#deleteJob").addEventListener("click", () => deleteEntity("Job", $("#jobId").value));
  $("#deleteCustomer").addEventListener("click", () => deleteEntity("Customer", $("#customerId").value));
  $("#deleteTech").addEventListener("click", () => deleteEntity("Technician", $("#techId").value));
  $("#deleteVendor").addEventListener("click", () => deleteEntity("Vendor", $("#vendorId").value));
  els.jobPhotoInput.addEventListener("change", uploadJobPhotos);
  $("#jobTypePreset").addEventListener("change", syncJobTypeInput);
  $("#jobAmount").addEventListener("input", formatJobAmountInput);
  $("#jobAmount").addEventListener("blur", formatJobAmountInput);
  $("#jobFee").addEventListener("input", formatJobFeeInput);
  $("#jobFee").addEventListener("blur", formatJobFeeInput);
  els.saveSettings.addEventListener("click", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ scriptUrl: els.scriptUrlInput.value.trim() }));
    showToast("DB 설정을 저장했습니다.");
  });
  els.searchInput.addEventListener("input", render);

  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });
  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => $(`#${button.dataset.closeDialog}`).close());
  });
  document.addEventListener("click", handleActionClick);
}

function handleActionClick(event) {
  const newButton = event.target.closest("[data-new]");
  if (newButton) {
    if (newButton.dataset.new === "customer") openCustomerDialog();
    if (newButton.dataset.new === "tech") openTechDialog();
    if (newButton.dataset.new === "vendor") openVendorDialog();
    return;
  }
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const id = button.dataset.id;
  if (button.dataset.action === "edit-job") openJobDialog(state.jobs.find((item) => item.id === id));
  if (button.dataset.action === "edit-customer") openCustomerDialog(state.customers.find((item) => item.id === id));
  if (button.dataset.action === "edit-tech") openTechDialog(state.technicians.find((item) => item.id === id));
  if (button.dataset.action === "edit-vendor") openVendorDialog(state.vendors.find((item) => item.id === id));
  if (button.dataset.action === "paid") markPaid(id);
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll("[data-tab]").forEach((item) => item.classList.toggle("active", item.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
  $(`#${tab}Panel`).classList.add("active");
  render();
}

function login(event) {
  event.preventDefault();
  const username = els.loginId.value.trim();
  const password = els.loginPassword.value.trim();
  setLoginMessage("확인 중입니다.");
  els.loginSubmit.disabled = true;
  if (username === ADMIN_LOGIN.username && password === ADMIN_LOGIN.password) {
    completeLogin(ADMIN_LOGIN);
    els.loginSubmit.disabled = false;
    return;
  }
  jsonp(getScriptUrl(), { action: "authUser", username, password })
    .then((result) => {
      if (!result || !result.ok) throw new Error(result?.error || "아이디 또는 비밀번호가 맞지 않습니다.");
      completeLogin(result.user || { username, name: username, role: "user" });
    })
    .catch((error) => setLoginMessage(error.message || "DB 서버 오류입니다. 관리자에게 문의하세요.", true))
    .finally(() => { els.loginSubmit.disabled = false; });
}

function completeLogin(user) {
  saveSession(user);
  window.rushcareCurrentUser = user;
  els.loginPassword.value = "";
  setLoginMessage("");
  document.body.classList.remove("auth-locked");
  els.loginScreen.hidden = true;
  els.loginScreen.style.display = "none";
  showToast(`${user.name || user.username} 계정으로 접속했습니다.`);
  loadFromDb();
}

function setLoginMessage(message, isError = false) {
  els.loginMessage.textContent = message;
  els.loginMessage.classList.toggle("error", isError);
}

function saveSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ user, expiresAt: Date.now() + SESSION_HOURS * 3600000 }));
}

function loadSession() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (!session?.user || Date.now() > Number(session.expiresAt || 0)) throw new Error();
    return session;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function getSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return { scriptUrl: parsed.scriptUrl || DEFAULT_SCRIPT_URL };
  } catch { return { scriptUrl: DEFAULT_SCRIPT_URL }; }
}

function getScriptUrl() { return getSettings().scriptUrl || DEFAULT_SCRIPT_URL; }

function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null")?.data || null; }
  catch { return null; }
}

function saveCache() {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data: state }));
}

async function loadFromDb() {
  if (busy || anyEditorOpen()) return;
  busy = true;
  els.reloadBtn.disabled = true;
  els.reloadBtn.textContent = "불러오는 중";
  try {
    const result = await jsonp(getScriptUrl(), { action: "getData" });
    if (!result?.ok) throw new Error(result?.error || "DB 불러오기 실패");
    state = normalizeData(result.data || {});
    saveCache();
    render();
    showToast("DB 데이터를 불러왔습니다.");
  } catch (error) { showToast(error.message || String(error)); }
  finally { busy = false; els.reloadBtn.disabled = false; els.reloadBtn.textContent = "DB 불러오기"; }
}

function anyEditorOpen() {
  return [els.jobDialog, els.customerDialog, els.techDialog, els.vendorDialog].some((dialog) => dialog.open);
}

function openJobDialog(job = null) {
  els.jobForm.reset();
  $("#jobDialogTitle").textContent = job ? "작업 수정" : "새 작업 등록";
  $("#deleteJob").hidden = !job;
  $("#jobId").value = job?.id || "";
  $("#jobDate").value = job?.date || todayISO;
  $("#jobTime").value = job?.time || "";
  $("#jobCustomer").value = job?.customer || "";
  $("#jobPhone").value = job?.phone || "";
  $("#jobReceiptNo").value = job?.receiptNo || "";
  $("#jobAddress").value = job?.address || "";
  setJobTypeValue(job?.type || "");
  $("#jobTech").value = job?.tech || "";
  $("#jobAmount").value = formatWon(job?.amount);
  $("#jobFee").value = formatWon(job?.fee);
  $("#jobPaymentMethod").value = job?.paymentMethod || "계좌이체";
  $("#jobTaxDocType").value = job?.taxDocType || "간이영수증";
  $("#jobStatus").value = normalizeStatusName(job?.status || "접수");
  $("#jobPaid").checked = Boolean(job?.paid);
  $("#jobMemo").value = job?.memo || "";
  $("#jobPhotos").hidden = !job;
  renderJobPhotos(job?.id || "");
  renderTechOptions();
  els.jobDialog.showModal();
}

async function submitJob(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(els.jobForm).entries());
  values.type = getJobTypeValue();
  values.amount = toNumber(values.amount);
  values.fee = toNumber(values.fee);
  values.status = resolveJobStatusForSave(values.status, $("#jobPaid").checked);
  const existing = state.jobs.find((item) => item.id === values.id) || {};
  const matchedCustomer = state.customers.find((item) => item.name === values.customer && item.phone === values.phone);
  const customer = matchedCustomer || (values.customer ? {
    id: createId(), name: values.customer, phone: values.phone || "", address: values.address || "",
    building: "", cycle: "", note: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  } : null);
  const job = {
    ...existing, ...values, id: values.id || createId(), customerId: customer?.id || existing.customerId || "",
    amount: values.amount, fee: values.fee, paid: resolveJobPaidForSave(values.status, $("#jobPaid").checked),
    createdAt: existing.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  await saveEntity("upsertJob", { job, customer }, "job", job.id, els.jobDialog, "작업을 저장했습니다.");
}

function openCustomerDialog(customer = null) {
  fillForm(els.customerForm, customer || {});
  $("#customerDialogTitle").textContent = customer ? "고객 수정" : "고객 등록";
  $("#deleteCustomer").hidden = !customer;
  els.customerDialog.showModal();
}

async function submitCustomer(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(els.customerForm).entries());
  const existing = state.customers.find((item) => item.id === values.id) || {};
  const customer = withTimestamps(existing, values);
  await saveEntity("upsertCustomer", customer, "customer", customer.id, els.customerDialog, "고객을 저장했습니다.");
}

function openTechDialog(tech = null) {
  fillForm(els.techForm, tech || {});
  $("#techDialogTitle").textContent = tech ? "기사 수정" : "기사 등록";
  $("#deleteTech").hidden = !tech;
  els.techDialog.showModal();
}

async function submitTech(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(els.techForm).entries());
  const existing = state.technicians.find((item) => item.id === values.id) || {};
  const duplicatePhone = findDuplicatePhone(values.phone, state.technicians, values.id, ["phone"]);
  if (duplicatePhone) {
    showToast(`이미 등록된 기사 전화번호입니다: ${duplicatePhone.name || duplicatePhone.phone}`);
    return;
  }
  const requestedName = values.name;
  values.name = resolveDuplicateName(values.name, state.technicians, values.id);
  if (values.name !== requestedName && !confirmDuplicateNameSuffix(requestedName, values.name)) return;
  const technician = withTimestamps(existing, values);
  const message = values.name !== requestedName ? `중복된 이름이라 ${values.name}(으)로 저장했습니다.` : "기사를 저장했습니다.";
  await saveEntity("upsertTechnician", technician, "technician", technician.id, els.techDialog, message);
}

function openVendorDialog(vendor = null) {
  fillForm(els.vendorForm, vendor || {});
  $("#vendorDialogTitle").textContent = vendor ? "업체 수정" : "업체 등록";
  $("#deleteVendor").hidden = !vendor;
  const selected = String(vendor?.technicianIds || "").split(",").filter(Boolean);
  $("#vendorTechChecks").innerHTML = state.technicians.map((tech) => `
    <label><input type="checkbox" name="technicianIds" value="${escapeHtml(tech.id)}" ${selected.includes(tech.id) ? "checked" : ""}>${escapeHtml(tech.name || "-")} · ${escapeHtml(tech.phone || "")}</label>
  `).join("") || '<p class="hint">등록된 기사가 없습니다.</p>';
  els.vendorDialog.showModal();
}

async function submitVendor(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(els.vendorForm).entries());
  values.technicianIds = [...els.vendorForm.querySelectorAll('input[name="technicianIds"]:checked')].map((item) => item.value).join(",");
  const existing = state.vendors.find((item) => item.id === values.id) || {};
  const duplicatePhone = findDuplicatePhone(values.phone, state.vendors, values.id, ["phone", "mobile"]) || findDuplicatePhone(values.mobile, state.vendors, values.id, ["phone", "mobile"]);
  if (duplicatePhone) {
    showToast(`이미 등록된 업체 전화번호입니다: ${duplicatePhone.name || duplicatePhone.phone || duplicatePhone.mobile}`);
    return;
  }
  const requestedName = values.name;
  values.name = resolveDuplicateName(values.name, state.vendors, values.id);
  if (values.name !== requestedName && !confirmDuplicateNameSuffix(requestedName, values.name)) return;
  const vendor = withTimestamps(existing, values);
  const message = values.name !== requestedName ? `중복된 이름이라 ${values.name}(으)로 저장했습니다.` : "업체를 저장했습니다.";
  await saveEntity("upsertVendor", vendor, "vendor", vendor.id, els.vendorDialog, message);
}

function withTimestamps(existing, values) {
  return { ...existing, ...values, id: values.id || createId(), createdAt: existing.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
}

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function resolveDuplicateName(name, collection, currentId) {
  const baseName = String(name || "").trim();
  if (!baseName) return baseName;
  const usedNames = new Set(
    (collection || [])
      .filter((item) => item.id !== currentId)
      .map((item) => normalizeText(item.name))
      .filter(Boolean)
  );
  if (!usedNames.has(normalizeText(baseName))) return baseName;

  let index = 2;
  let nextName = `${baseName}${index}`;
  while (usedNames.has(normalizeText(nextName))) {
    index += 1;
    nextName = `${baseName}${index}`;
  }
  return nextName;
}

function confirmDuplicateNameSuffix(originalName, nextName) {
  alert(`이미 등록된 이름입니다: ${originalName}`);
  return confirm(`${nextName}(으)로 이름 뒤에 숫자를 붙여 저장할까요?`);
}

function findDuplicatePhone(phone, collection, currentId, fields) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  return (collection || []).find((item) => {
    if (item.id === currentId) return false;
    return fields.some((field) => normalizePhone(item[field]) === normalized);
  }) || null;
}

function fillForm(form, data) {
  form.reset();
  [...form.elements].forEach((field) => {
    if (field.name && field.type !== "checkbox" && Object.hasOwn(data, field.name)) field.value = data[field.name] ?? "";
  });
}

async function saveEntity(action, payload, resultKey, id, dialog, message) {
  if (busy) return;
  busy = true;
  try {
    const result = await jsonp(getScriptUrl(), { action, data: encodeBase64Utf8(JSON.stringify(payload)) });
    if (!result?.ok) throw new Error(result?.error || "저장에 실패했습니다.");
    const collection = collectionForResult(resultKey);
    const saved = result[resultKey];
    const index = collection.findIndex((item) => item.id === id);
    if (index >= 0) collection[index] = resultKey === "job" ? normalizeJob(saved) : saved;
    else collection.push(resultKey === "job" ? normalizeJob(saved) : saved);
    if (result.customer) upsertLocal(state.customers, result.customer);
    saveCache(); render(); dialog.close(); showToast(message);
  } catch (error) { showToast(error.message || String(error)); }
  finally { busy = false; }
}

function collectionForResult(key) {
  return { job: state.jobs, customer: state.customers, technician: state.technicians, vendor: state.vendors }[key];
}

function upsertLocal(collection, item) {
  const index = collection.findIndex((row) => row.id === item.id);
  if (index >= 0) collection[index] = item; else collection.push(item);
}

async function deleteEntity(type, id) {
  if (!id || busy || !confirm("삭제한 자료는 되돌릴 수 없습니다. 삭제하시겠습니까?")) return;
  busy = true;
  try {
    const result = await jsonp(getScriptUrl(), { action: `delete${type}`, id });
    if (!result?.ok) throw new Error(result?.error || "삭제에 실패했습니다.");
    const map = { Job: ["jobs", els.jobDialog], Customer: ["customers", els.customerDialog], Technician: ["technicians", els.techDialog], Vendor: ["vendors", els.vendorDialog] };
    const [key, dialog] = map[type];
    state[key] = state[key].filter((item) => item.id !== id);
    if (type === "Job") state.photos = state.photos.filter((photo) => photo.jobId !== id);
    saveCache(); render(); dialog.close(); showToast("삭제했습니다.");
  } catch (error) { showToast(error.message || String(error)); }
  finally { busy = false; }
}

async function markPaid(id) {
  const existing = state.jobs.find((job) => job.id === id);
  if (!existing || busy) return;
  const job = { ...existing, paid: true, status: "작업완료", updatedAt: new Date().toISOString() };
  await saveEntity("upsertJob", { job, customer: null }, "job", id, { close() {} }, "수금완료로 변경했습니다.");
}

async function uploadJobPhotos(event) {
  const jobId = $("#jobId").value;
  const files = [...event.target.files];
  if (!jobId || !files.length || busy) return;
  busy = true;
  try {
    for (const file of files) {
      const base64 = await fileToBase64(file);
      const result = await postApi({ action: "uploadPhoto", id: createId(), jobId, name: file.name, mimeType: file.type || "image/jpeg", base64 });
      if (!result?.ok) throw new Error(result?.error || "사진 업로드에 실패했습니다.");
      state.photos.push(result.photo);
    }
    saveCache(); renderJobPhotos(jobId); showToast("사진을 업로드했습니다.");
  } catch (error) { showToast(error.message || "사진 업로드에 실패했습니다."); }
  finally { busy = false; event.target.value = ""; }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function postApi(payload) {
  const response = await fetch(getScriptUrl(), { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload), redirect: "follow" });
  return response.json();
}

function renderJobPhotos(jobId) {
  const photos = state.photos.filter((photo) => photo.jobId === jobId);
  els.jobPhotoList.innerHTML = photos.map((photo) => `<a href="${escapeHtml(photo.url)}" target="_blank" rel="noopener"><img src="${escapeHtml(photo.thumbnailUrl || photo.url)}" alt="${escapeHtml(photo.name || "현장 사진")}"></a>`).join("");
}

function jsonp(url, params) {
  return new Promise((resolve, reject) => {
    const callback = `rushcareJsonp_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const script = document.createElement("script");
    const cleanUrl = new URL(url);
    Object.entries(params).forEach(([key, value]) => cleanUrl.searchParams.set(key, value));
    cleanUrl.searchParams.set("callback", callback);
    const timer = setTimeout(() => { cleanup(); reject(new Error("DB 응답 시간이 초과되었습니다.")); }, 25000);
    window[callback] = (data) => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error("DB URL 또는 서버 상태를 확인하세요.")); };
    function cleanup() { clearTimeout(timer); delete window[callback]; script.remove(); }
    script.src = cleanUrl.toString();
    document.body.appendChild(script);
  });
}

function normalizeData(data) {
  return {
    customers: Array.isArray(data.customers) ? data.customers : [],
    jobs: Array.isArray(data.jobs) ? data.jobs.map(normalizeJob) : [],
    photos: Array.isArray(data.photos) ? data.photos : [],
    technicians: Array.isArray(data.technicians) ? data.technicians : [],
    vendors: Array.isArray(data.vendors) ? data.vendors : []
  };
}

function normalizeJob(job) {
  const status = normalizeStatusName(job.status);
  const paid = status === "작업완료"
    ? true
    : status === "작업완료(미수)"
      ? false
      : job.paid === true || job.paid === "true";
  return { ...job, date: normalizeDate(job.date), amount: toNumber(job.amount), fee: toNumber(job.fee), status, paid };
}

function normalizeStatusName(status) {
  const value = String(status || "접수").trim();
  const map = { "출동": "예약", "완료": "작업완료", "미수금": "작업완료(미수)", "취소": "접수취소" };
  return map[value] || value;
}

function isActiveStatus(status) {
  return !["작업완료", "작업완료(미수)", "접수취소"].includes(normalizeStatusName(status));
}

function isUnpaidJob(job) {
  return !job.paid || normalizeStatusName(job.status) === "작업완료(미수)";
}

function resolveJobStatusForSave(status, paid) {
  const normalized = normalizeStatusName(status);
  if (normalized === "작업완료(미수)" && paid) return "작업완료";
  if (normalized === "작업완료" && !paid) return "작업완료(미수)";
  return normalized;
}

function resolveJobPaidForSave(status, paid) {
  const normalized = normalizeStatusName(status);
  if (normalized === "작업완료") return true;
  if (normalized === "작업완료(미수)") return false;
  return paid;
}

function normalizeDate(value) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : localDateISO(parsed);
}

function render() {
  const query = els.searchInput.value.trim().toLowerCase();
  const jobs = sortJobs(state.jobs);
  const filteredJobs = jobs.filter((job) => matchesText([job.receiptNo, job.customer, job.phone, job.address, job.type, job.tech, job.memo, job.status], query));
  const customers = state.customers.filter((item) => matchesText([item.name, item.phone, item.address, item.building, item.note], query));
  const techs = state.technicians.filter((item) => matchesText([item.name, item.phone, item.businessNo, item.note], query));
  const vendors = state.vendors.filter((item) => matchesText([item.name, item.businessNo, item.owner, item.phone, item.mobile, item.address, item.note], query));
  const todayJobs = filteredJobs.filter((job) => job.date === todayISO);
  const payments = filteredJobs.filter((job) => isUnpaidJob(job));

  renderMetrics(jobs);
  renderList(els.todayList, todayJobs, renderJobCard, "오늘 일정이 없습니다.");
  renderList(els.jobsList, filteredJobs.slice(0, query ? 300 : 60), renderJobCard, "작업 내역이 없습니다.");
  renderList(els.customersList, customers.slice(0, query ? 300 : 60), renderCustomerCard, "고객 내역이 없습니다.");
  renderList(els.paymentsList, payments.slice(0, query ? 300 : 60), renderPaymentCard, "미수 작업이 없습니다.");
  renderList(els.techsList, techs, renderTechCard, "기사 내역이 없습니다.");
  renderList(els.vendorsList, vendors, renderVendorCard, "업체 내역이 없습니다.");
  els.todayCount.textContent = `${todayJobs.length}건`; els.jobsCount.textContent = `${filteredJobs.length}건`;
  els.customersCount.textContent = `${customers.length}명`; els.paymentsCount.textContent = `${payments.length}건`;
  els.techsCount.textContent = `${techs.length}명`; els.vendorsCount.textContent = `${vendors.length}곳`;
  renderTechOptions();
}

function renderMetrics(jobs) {
  const ym = todayISO.slice(0, 7);
  els.metricToday.textContent = jobs.filter((job) => job.date === todayISO).length;
  els.metricActive.textContent = jobs.filter((job) => isActiveStatus(job.status)).length;
  const paidMonthJobs = jobs.filter((job) => job.date?.slice(0, 7) === ym && job.paid);
  els.metricRevenue.textContent = formatWon(paidMonthJobs.reduce((sum, job) => sum + job.amount - job.fee, 0));
  els.metricOutsourceFee.textContent = formatWon(paidMonthJobs.reduce((sum, job) => sum + job.fee, 0));
  els.metricUnpaid.textContent = formatWon(jobs.filter((job) => isUnpaidJob(job)).reduce((sum, job) => sum + job.amount, 0));
}

function renderList(target, items, renderer, emptyText) {
  target.innerHTML = items.length ? items.map(renderer).join("") : `<div class="empty">${escapeHtml(emptyText)}</div>`;
}

function renderJobCard(job) {
  return `<article class="item-card"><div class="item-top"><div class="item-title">${escapeHtml(job.date || "-")} ${escapeHtml(job.time || "")}<br>${escapeHtml(job.customer || "-")}</div><span class="badge">${escapeHtml(job.status || "접수")}</span></div><div class="item-meta">${escapeHtml(job.receiptNo ? `접수 ${job.receiptNo} · ` : "")}${escapeHtml(job.type || "-")} · ${escapeHtml(job.tech || "담당자 없음")} · ${escapeHtml(formatWon(job.amount))}<br>${escapeHtml(job.address || "")}<br>${escapeHtml(job.memo || "")}</div><div class="card-actions"><button data-action="edit-job" data-id="${escapeHtml(job.id)}">수정</button></div></article>`;
}

function renderPaymentCard(job) {
  return `<article class="item-card"><div class="item-top"><div class="item-title">${escapeHtml(job.customer || "-")}</div><span class="badge amount-danger">${escapeHtml(formatWon(job.amount))}</span></div><div class="item-meta">${escapeHtml(job.date || "-")} · ${escapeHtml(job.type || "-")} · ${escapeHtml(job.paymentMethod || "-")}<br>${escapeHtml(job.address || "")}</div><div class="card-actions"><button data-action="edit-job" data-id="${escapeHtml(job.id)}" class="secondary">수정</button><button data-action="paid" data-id="${escapeHtml(job.id)}">수금완료</button></div></article>`;
}

function renderCustomerCard(item) {
  return `<article class="item-card"><div class="item-top"><div class="item-title">${escapeHtml(item.name || "-")}</div><span class="badge">${escapeHtml(item.cycle || "관리")}</span></div><div class="item-meta">${escapeHtml(item.phone || "")}<br>${escapeHtml(item.address || "")}<br>${escapeHtml(item.note || "")}</div><div class="card-actions"><button data-action="edit-customer" data-id="${escapeHtml(item.id)}">수정</button></div></article>`;
}

function renderTechCard(item) {
  const jobs = state.jobs.filter((job) => job.tech === item.name);
  return `<article class="item-card"><div class="item-top"><div class="item-title">${escapeHtml(item.name || "-")}</div><span class="badge">${jobs.length}건</span></div><div class="item-meta">${escapeHtml(item.phone || "")}<br>${escapeHtml(item.businessNo || "")}<br>총 금액 ${escapeHtml(formatWon(jobs.reduce((sum, job) => sum + job.amount, 0)))}</div><div class="card-actions"><button data-action="edit-tech" data-id="${escapeHtml(item.id)}">수정</button></div></article>`;
}

function renderVendorCard(item) {
  const ids = String(item.technicianIds || "").split(",");
  const names = state.technicians.filter((tech) => ids.includes(tech.id)).map((tech) => tech.name).join(", ");
  return `<article class="item-card"><div class="item-top"><div class="item-title">${escapeHtml(item.name || "-")}</div><span class="badge">업체</span></div><div class="item-meta">${escapeHtml(item.businessNo || "")} · ${escapeHtml(item.owner || "")}<br>${escapeHtml(item.phone || item.mobile || "")}<br>소속기사 ${escapeHtml(names || "없음")}<br>${escapeHtml(item.note || "")}</div><div class="card-actions"><button data-action="edit-vendor" data-id="${escapeHtml(item.id)}">수정</button></div></article>`;
}

function renderTechOptions() {
  els.techOptions.innerHTML = state.technicians.map((tech) => `<option value="${escapeHtml(tech.name || "")}"></option>`).join("");
}

function getJobTypeValue() {
  return $("#jobTypePreset").value === "직접입력" ? $("#jobType").value.trim() : $("#jobTypePreset").value;
}

function setJobTypeValue(value) {
  const preset = $("#jobTypePreset");
  const input = $("#jobType");
  const normalized = String(value || "").trim();
  const hasOption = [...preset.options].some((option) => option.value === normalized);
  if (normalized && hasOption) {
    preset.value = normalized;
    input.value = "";
  } else {
    preset.value = "직접입력";
    input.value = normalized;
  }
  syncJobTypeInput();
}

function syncJobTypeInput() {
  const isCustom = $("#jobTypePreset").value === "직접입력";
  $("#jobType").hidden = !isCustom;
  $("#jobType").required = isCustom;
}

function formatJobAmountInput() {
  $("#jobAmount").value = formatWon($("#jobAmount").value);
}

function formatJobFeeInput() {
  $("#jobFee").value = formatWon($("#jobFee").value);
}

function sortJobs(jobs) {
  return [...jobs].sort((a, b) => `${b.date || ""} ${b.time || ""} ${b.createdAt || ""}`.localeCompare(`${a.date || ""} ${a.time || ""} ${a.createdAt || ""}`));
}

function matchesText(values, query) { return !query || values.some((value) => String(value || "").toLowerCase().includes(query)); }
function toNumber(value) { const number = Number(String(value || "0").replace(/[^0-9.-]/g, "")); return Number.isFinite(number) ? number : 0; }
function formatWon(value) { return `${toNumber(value).toLocaleString("ko-KR")}원`; }
function localDateISO(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function createId() { return crypto.randomUUID ? crypto.randomUUID() : `mobile-${Date.now()}-${Math.floor(Math.random() * 100000)}`; }
function encodeBase64Utf8(text) { const bytes = new TextEncoder().encode(text); let binary = ""; bytes.forEach((byte) => binary += String.fromCharCode(byte)); return btoa(binary); }
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function showToast(message) { els.toast.textContent = message; els.toast.classList.add("show"); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 3500); }
