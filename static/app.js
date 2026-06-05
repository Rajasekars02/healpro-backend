/* ==========================================
   HEALPRO PREMIUM ACCESSIBLE MOBILE LOGIC
   ========================================== */

document.addEventListener("DOMContentLoaded", () => {
    // State management
    let allSymptomsList = [];
    let selectedSymptoms = new Set();
    let currentConversationSymptoms = [];
    let currentQuestions = [];
    let questionIndex = 0;

    // Time ticker for status bar
    function updateClock() {
        const now = new Date();
        let hours = now.getHours();
        let minutes = now.getMinutes();
        minutes = minutes < 10 ? '0' + minutes : minutes;
        const timeStr = hours + ':' + minutes;
        const el = document.getElementById("statusTime");
        if (el) el.textContent = timeStr;
    }
    setInterval(updateClock, 1000);
    updateClock();

    // ----------------------------------------------------
    // Tab Navigation
    // ----------------------------------------------------
    const navItems = document.querySelectorAll(".nav-item");
    const screenViews = document.querySelectorAll(".screen-view");

    navItems.forEach(item => {
        item.addEventListener("click", () => {
            const targetScreen = item.getAttribute("data-screen");
            
            navItems.forEach(i => i.classList.remove("active"));
            screenViews.forEach(s => s.classList.remove("active"));

            item.classList.add("active");
            document.getElementById(targetScreen).classList.add("active");
            
            // Scroll screen container to top
            document.querySelector(".app-screens").scrollTop = 0;
        });
    });

    // ----------------------------------------------------
    // Accessibility Settings Panel
    // ----------------------------------------------------
    const btnAccessibility = document.getElementById("btnAccessibility");
    const accessibilityPanel = document.getElementById("accessibilityPanel");
    const btnCloseAccessibility = document.getElementById("btnCloseAccessibility");

    btnAccessibility.addEventListener("click", () => {
        accessibilityPanel.style.display = accessibilityPanel.style.display === "block" ? "none" : "block";
    });

    btnCloseAccessibility.addEventListener("click", () => {
        accessibilityPanel.style.display = "none";
    });

    // Font size controls
    const sizeBtns = document.querySelectorAll(".size-btn");
    sizeBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            sizeBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            
            const size = btn.getAttribute("data-size");
            document.body.classList.remove("accessibility-large", "accessibility-extra");
            
            if (size === "large") {
                document.body.classList.add("accessibility-large");
            } else if (size === "extra") {
                document.body.classList.add("accessibility-extra");
            }
        });
    });

    // Theme toggles
    const themeBtns = document.querySelectorAll(".theme-btn");
    themeBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            themeBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            
            const theme = btn.getAttribute("data-theme");
            document.body.classList.remove("theme-light", "theme-contrast");
            
            if (theme === "light") {
                document.body.classList.add("theme-light");
            } else if (theme === "contrast") {
                document.body.classList.add("theme-contrast");
            }
        });
    });

    // Bezel layout toggles (Desktop Dashboard vs Mobile Mockup)
    const chkMockupBorder = document.getElementById("chkMockupBorder");
    const phoneMockup = document.querySelector(".phone-mockup");
    const layoutToggle = document.getElementById("layoutToggle");
    const layoutBtns = document.querySelectorAll(".layout-btn");

    function setLayoutMode(mode, save = true) {
        if (mode === "desktop") {
            document.body.classList.add("layout-desktop");
            document.body.classList.remove("layout-mobile");
            if (chkMockupBorder) chkMockupBorder.checked = false;
            layoutBtns.forEach(btn => {
                if (btn.getAttribute("data-layout") === "desktop") btn.classList.add("active");
                else btn.classList.remove("active");
            });
        } else {
            document.body.classList.remove("layout-desktop");
            document.body.classList.add("layout-mobile");
            if (chkMockupBorder) chkMockupBorder.checked = true;
            layoutBtns.forEach(btn => {
                if (btn.getAttribute("data-layout") === "mobile") btn.classList.add("active");
                else btn.classList.remove("active");
            });
        }
        if (save) {
            localStorage.setItem("healpro-layout-mode", mode);
        }
        window.dispatchEvent(new Event("resize"));
    }

    // Initialize layout from localStorage or default based on current screen width
    const savedLayout = localStorage.getItem("healpro-layout-mode");
    const defaultMode = savedLayout || (window.innerWidth >= 900 ? "desktop" : "mobile");
    setLayoutMode(defaultMode, false);

    layoutBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            setLayoutMode(btn.getAttribute("data-layout"));
        });
    });

    // Keep layout responsive when the browser is resized
    window.addEventListener("resize", () => {
        if (!savedLayout) {
            const autoMode = window.innerWidth >= 900 ? "desktop" : "mobile";
            setLayoutMode(autoMode, false);
        }
    });

    if (chkMockupBorder) {
        chkMockupBorder.addEventListener("change", () => {
            setLayoutMode(chkMockupBorder.checked ? "mobile" : "desktop");
        });
    }

    // Reset application state
    const btnResetApp = document.getElementById("btnResetApp");
    btnResetApp.addEventListener("click", () => {
        // Clear chatbot
        selectedSymptoms.clear();
        currentConversationSymptoms = [];
        updateTags();
        document.getElementById("symptomSearch").value = "";
        document.getElementById("btnAnalyzeSymptoms").disabled = true;
        
        // Reset chat bubbles to default
        const chatMessages = document.getElementById("chatMessages");
        chatMessages.innerHTML = `
            <div class="chat-message bot">
                <div class="message-bubble">
                    Hello! I am your <strong>HealPRO AI</strong> assistant. Select one or more symptoms from the search box below to begin our diagnostic assessment.
                </div>
            </div>
        `;

        // Clear forms
        document.querySelectorAll("form").forEach(f => f.reset());
        document.getElementById("kdnAdvancedFields").classList.remove("active");
        document.getElementById("kdnAdvancedToggle").classList.remove("active");
        document.getElementById("thyAdvancedFields").classList.remove("active");
        document.getElementById("thyAdvancedToggle").classList.remove("active");
        document.getElementById("screenCalculators").classList.remove("has-results");
        document.getElementById("calcResults").style.display = "none";

        alert("Application status has been reset.");
    });


    // ----------------------------------------------------
    // Symptom AI Chatbot Diagnoser
    // ----------------------------------------------------
    // Determine API base URL — fallback to localhost:8000 when page is opened via file://
    const API_BASE = (function(){
        try {
            const origin = window.location && window.location.origin;
            if (!origin || origin === 'null' || origin.startsWith('file://')) return 'http://localhost:8000';
            return origin;
        } catch (e) { return 'http://localhost:8000'; }
    })();
    console.log('✓ HealPRO API_BASE initialized:', API_BASE);
    const symptomSearch = document.getElementById("symptomSearch");
    const symptomDropdown = document.getElementById("symptomDropdown");
    const selectedTagsContainer = document.getElementById("selectedTags");
    const btnAnalyzeSymptoms = document.getElementById("btnAnalyzeSymptoms");
    const chatMessages = document.getElementById("chatMessages");

    // Fetch symptoms from server
    async function loadSymptoms() {
        try {
            const url = `${API_BASE}/api/symptoms`;
            console.log('Fetching symptoms from:', url);
            const res = await fetch(url);
            if (res.ok) {
                allSymptomsList = await res.json();
                console.log('✓ Symptoms loaded:', allSymptomsList.length);
            } else {
                console.error("Failed to load symptoms list - status:", res.status);
            }
        } catch (err) {
            console.error("Network error fetching symptoms from " + API_BASE + ":", err.message);
        }
    }
    loadSymptoms();

    // Dropdown search events
    symptomSearch.addEventListener("focus", () => {
        showFilteredSymptoms();
    });

    symptomSearch.addEventListener("input", () => {
        showFilteredSymptoms();
        updateAnalyzeButtonState();
    });

    symptomSearch.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            addCurrentTypedSymptom();
        }
    });

    document.addEventListener("click", (e) => {
        if (!symptomSearch.contains(e.target) && !symptomDropdown.contains(e.target)) {
            symptomDropdown.style.display = "none";
        }
    });

    function showFilteredSymptoms() {
        const query = symptomSearch.value.trim().toLowerCase();
        symptomDropdown.innerHTML = "";
        
        const filtered = allSymptomsList.filter(sym => 
            sym.includes(query) && !selectedSymptoms.has(sym)
        ).slice(0, 10); // Show max 10 candidates

        if (filtered.length > 0) {
            filtered.forEach(sym => {
                const div = document.createElement("div");
                div.className = "symptom-item";
                div.textContent = sym;
                div.addEventListener("click", () => {
                    addSymptomTag(sym);
                    symptomSearch.value = "";
                    symptomDropdown.style.display = "none";
                });
                symptomDropdown.appendChild(div);
            });
            symptomDropdown.style.display = "block";
        } else {
            symptomDropdown.style.display = "none";
        }
    }

    function normalizeSymptom(value) {
        return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
    }

    function addCurrentTypedSymptom() {
        const typedSymptom = normalizeSymptom(symptomSearch.value);
        if (!typedSymptom) return false;
        if (!selectedSymptoms.has(typedSymptom)) {
            selectedSymptoms.add(typedSymptom);
            updateTags();
        }
        symptomSearch.value = "";
        symptomDropdown.style.display = "none";
        return true;
    }

    function addSymptomTag(sym) {
        selectedSymptoms.add(normalizeSymptom(sym));
        updateTags();
    }

    function updateAnalyzeButtonState() {
        btnAnalyzeSymptoms.disabled = selectedSymptoms.size === 0 && !normalizeSymptom(symptomSearch.value);
    }

    function updateTags() {
        selectedTagsContainer.innerHTML = "";
        selectedSymptoms.forEach(sym => {
            const tag = document.createElement("div");
            tag.className = "tag";
            tag.innerHTML = `
                <span>${sym}</span>
                <span class="tag-remove">&times;</span>
            `;
            tag.querySelector(".tag-remove").addEventListener("click", () => {
                selectedSymptoms.delete(sym);
                updateTags();
            });
            selectedTagsContainer.appendChild(tag);
        });
        
        // Toggle analyze button
        updateAnalyzeButtonState();
    }

    // Analyze symptoms initially
    btnAnalyzeSymptoms.addEventListener("click", async () => {
        if (selectedSymptoms.size === 0 && normalizeSymptom(symptomSearch.value)) {
            addCurrentTypedSymptom();
        }
        if (selectedSymptoms.size === 0) return;
        
        currentConversationSymptoms = Array.from(selectedSymptoms);
        
        // Append user response to chat bubbles
        appendChatMessage("user", `I have the following symptoms: ${currentConversationSymptoms.join(", ")}`);
        
        // Disable analyze controls temporarily
        symptomSearch.value = "";
        symptomSearch.disabled = true;
        btnAnalyzeSymptoms.disabled = true;
        selectedTagsContainer.style.opacity = "0.5";

        // Query initial diagnosis
        try {
            const url = `${API_BASE}/api/diagnose/initiate`;
            console.log('POSTing to:', url, 'with symptoms:', currentConversationSymptoms);
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ symptoms: currentConversationSymptoms })
            });
            
            if (res.ok) {
                const data = await res.json();
                console.log('✓ Response OK, questions:', data.questions?.length || 0);
                currentQuestions = data.questions || [];
                questionIndex = 0;
                
                if (currentQuestions.length > 0) {
                    // Ask clarifying question
                    askClarifyingQuestion();
                } else {
                    // Direct final diagnosis
                    getFinalDiagnosis();
                }
            } else {
                // Try to surface server error details for debugging
                let errMsg = `Server returned ${res.status}`;
                try {
                    const body = await res.json();
                    if (body.detail) errMsg = body.detail;
                    else if (body.error) errMsg = body.error;
                    else if (body.message) errMsg = body.message;
                    else errMsg = JSON.stringify(body);
                } catch (e) {
                    const text = await res.text();
                    if (text) errMsg = text;
                }
                console.error("Diagnose initiate failed:", res.status, errMsg);
                appendChatMessage("bot", `Sorry, I had trouble processing that request: ${errMsg}`);
                enableSymptomInput();
            }
        } catch (err) {
              console.error("Network error initiating diagnosis:", err.message || err);
              appendChatMessage("bot", "Network error. Please make sure the backend server is running on http://localhost:8000");
            enableSymptomInput();
        }
    });

    function appendChatMessage(sender, text, htmlContent = null) {
        const messageDiv = document.createElement("div");
        messageDiv.className = `chat-message ${sender}`;
        
        const bubble = document.createElement("div");
        bubble.className = "message-bubble";
        
        if (htmlContent) {
            bubble.innerHTML = htmlContent;
        } else {
            bubble.textContent = text;
        }
        
        messageDiv.appendChild(bubble);
        chatMessages.appendChild(messageDiv);
        
        // Scroll chat to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function askClarifyingQuestion() {
        if (questionIndex < currentQuestions.length) {
            const qSymptom = currentQuestions[questionIndex];
            
            // Render bot bubble
            const botMsg = `Do you also experience <strong>${qSymptom}</strong>? This helps me narrow down the possibilities.`;
            appendChatMessage("bot", "", botMsg);
            
            // Render yes/no options inside a container
            const optionsDiv = document.createElement("div");
            optionsDiv.className = "prompt-options";
            optionsDiv.innerHTML = `
                <button class="prompt-opt-btn btn-yes">Yes, I experience this</button>
                <button class="prompt-opt-btn btn-no">No, I do not</button>
                <button class="prompt-opt-btn btn-finish" style="background: rgba(139,92,246,0.15); border-color: var(--primary);">Skip & Diagnose Now</button>
            `;
            
            optionsDiv.querySelector(".btn-yes").addEventListener("click", () => {
                optionsDiv.remove();
                appendChatMessage("user", `Yes, I have ${qSymptom}`);
                currentConversationSymptoms.push(qSymptom);
                questionIndex++;
                askClarifyingQuestion();
            });

            optionsDiv.querySelector(".btn-no").addEventListener("click", () => {
                optionsDiv.remove();
                appendChatMessage("user", `No, I don't have ${qSymptom}`);
                questionIndex++;
                askClarifyingQuestion();
            });

            optionsDiv.querySelector(".btn-finish").addEventListener("click", () => {
                optionsDiv.remove();
                appendChatMessage("user", "That's all the symptoms. Check diagnosis.");
                getFinalDiagnosis();
            });

            chatMessages.appendChild(optionsDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        } else {
            getFinalDiagnosis();
        }
    }

    async function getFinalDiagnosis() {
        appendChatMessage("bot", "Analyzing symptoms and clinical mappings...");
        
        try {
            const res = await fetch(`${API_BASE}/api/diagnose/final`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ symptoms: currentConversationSymptoms })
            });

            if (res.ok) {
                const data = await res.json();
                const scorePercent = Math.round(data.score * 100);
                
                let riskClass = "risk-low";
                if (data.risk_level.toLowerCase().includes("high")) riskClass = "risk-high";
                else if (data.risk_level.toLowerCase().includes("moderate") || data.risk_level.toLowerCase().includes("varies")) riskClass = "risk-moderate";
                
                const reportHtml = `
                    <div class="diag-card">
                        <div class="diag-header">
                            <span class="diag-title">${data.disease}</span>
                            <span class="diag-score">${scorePercent}% Match</span>
                        </div>
                        <div class="diag-row">
                            <strong>Recommended Specialist</strong>
                            <span>${data.doctor}</span>
                        </div>
                        <div class="diag-row">
                            <strong>Recommended Treatment/Cures</strong>
                            <span>${data.cures}</span>
                        </div>
                        <div class="diag-row">
                            <strong>Condition Severity Level</strong>
                            <span class="diag-risk-badge ${riskClass}">${data.risk_level}</span>
                        </div>
                    </div>
                `;
                appendChatMessage("bot", "", reportHtml);
            } else {
                let errMsg = `Server returned ${res.status}`;
                try {
                    const body = await res.json();
                    if (body.detail) errMsg = body.detail;
                    else if (body.error) errMsg = body.error;
                    else if (body.message) errMsg = body.message;
                    else errMsg = JSON.stringify(body);
                } catch (e) {
                    const text = await res.text();
                    if (text) errMsg = text;
                }
                console.error("Diagnose final failed:", res.status, errMsg);
                appendChatMessage("bot", `Failed to retrieve final diagnostic report: ${errMsg}`);
            }
        } catch (err) {
            console.error("Network error getting final diagnosis:", err);
            appendChatMessage("bot", "Connection error. Failed to retrieve details.");
        }
        
        enableSymptomInput();
    }

    function enableSymptomInput() {
        symptomSearch.disabled = false;
        selectedTagsContainer.style.opacity = "1";
        selectedSymptoms.clear();
        updateTags();
    }

    // ----------------------------------------------------
    // Clinical Risk Calculators Forms
    // ----------------------------------------------------
    const calcTabBtns = document.querySelectorAll(".calc-tab-btn");
    const calcForms = document.querySelectorAll(".calc-form");

    calcTabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const targetCalc = btn.getAttribute("data-calc");
            
            calcTabBtns.forEach(b => b.classList.remove("active"));
            calcForms.forEach(f => f.classList.remove("active"));

            btn.classList.add("active");
            
            if (targetCalc === "diabetes") document.getElementById("formDiabetes").classList.add("active");
            else if (targetCalc === "heart") document.getElementById("formHeart").classList.add("active");
            else if (targetCalc === "kidney") document.getElementById("formKidney").classList.add("active");
            else if (targetCalc === "thyroid") document.getElementById("formThyroid").classList.add("active");
        });
    });

    // Advanced toggles
    const kdnAdvancedToggle = document.getElementById("kdnAdvancedToggle");
    const kdnAdvancedFields = document.getElementById("kdnAdvancedFields");
    kdnAdvancedToggle.addEventListener("click", () => {
        kdnAdvancedToggle.classList.toggle("active");
        kdnAdvancedFields.classList.toggle("active");
    });

    const thyAdvancedToggle = document.getElementById("thyAdvancedToggle");
    const thyAdvancedFields = document.getElementById("thyAdvancedFields");
    thyAdvancedToggle.addEventListener("click", () => {
        thyAdvancedToggle.classList.toggle("active");
        thyAdvancedFields.classList.toggle("active");
    });

    // Form submission prediction routing
    const calcResults = document.getElementById("calcResults");
    const btnCloseResults = document.getElementById("btnCloseResults");
    const resTitle = document.getElementById("resTitle");
    const resPercent = document.getElementById("resPercent");
    const resBadge = document.getElementById("resBadge");
    const resExplanation = document.getElementById("resExplanation");
    const resGaugeFill = document.getElementById("resGaugeFill");

    btnCloseResults.addEventListener("click", () => {
        calcResults.style.display = "none";
        document.getElementById("screenCalculators").classList.remove("has-results");
    });

    function showRiskResult(diseaseName, percentage) {
        resTitle.textContent = `${diseaseName} Risk Assessment`;
        resPercent.textContent = `${percentage}%`;
        
        // Gauge ring animation (dashoffset from 314 down to 0)
        const offset = 314 - (314 * percentage / 100);
        resGaugeFill.style.strokeDashoffset = offset;
        
        // Assign colors & badges
        resBadge.className = "risk-badge";
        if (percentage < 30) {
            resBadge.classList.add("risk-low");
            resBadge.textContent = "Low Risk";
            resExplanation.textContent = "Your parameters indicate a healthy range. Maintain a balanced diet, stay active, and conduct standard checks annually.";
            resGaugeFill.style.stroke = "#10b981";
        } else if (percentage < 70) {
            resBadge.classList.add("risk-moderate");
            resBadge.textContent = "Moderate Risk";
            resExplanation.textContent = "Your parameters show elevated levels. We advise consulting a general practitioner to review your physical activities, dietary routines, and potential screenings.";
            resGaugeFill.style.stroke = "#f59e0b";
        } else {
            resBadge.classList.add("risk-high");
            resBadge.textContent = "High Risk";
            resExplanation.textContent = "Warning: The classifier predicts high risk factor scores. We strongly recommend making an appointment with a specialist to review these symptoms.";
            resGaugeFill.style.stroke = "#ef4444";
        }

        document.getElementById("screenCalculators").classList.add("has-results");
        calcResults.style.display = "flex";
    }

    // Diabetes Calculator Submission
    document.getElementById("formDiabetes").addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = {
            pregnancies: parseFloat(document.getElementById("diaPreg").value) || 0,
            glucose: parseFloat(document.getElementById("diaGlucose").value) || 0,
            bloodPressure: parseFloat(document.getElementById("diaBP").value) || 0,
            skinThickness: parseFloat(document.getElementById("diaSkin").value) || 0,
            insulin: parseFloat(document.getElementById("diaInsulin").value) || 0,
            bmi: parseFloat(document.getElementById("diaBMI").value) || 0,
            pedigree: parseFloat(document.getElementById("diaPedigree").value) || 0.47,
            age: parseFloat(document.getElementById("diaAge").value) || 0
        };

        try {
            const res = await fetch(`${API_BASE}/api/predict/diabetes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                const data = await res.json();
                showRiskResult("Diabetes", data.risk_percentage);
            } else {
                alert("Failed to calculate risk prediction.");
            }
        } catch (err) {
            alert("Connection error. Ensure backend server is running.");
        }
    });

    // -----------------------------
    // Persist & Autofill Calculator Forms
    // -----------------------------
    function saveFormState(formEl) {
        try {
            const state = {};
            formEl.querySelectorAll('input[id], select[id], textarea[id]').forEach(el => {
                state[el.id] = el.value;
            });
            localStorage.setItem(`healpro:form:${formEl.id}`, JSON.stringify(state));
        } catch (e) {
            console.warn('Failed to save form state', e);
        }
    }

    function restoreFormState(formEl) {
        try {
            const raw = localStorage.getItem(`healpro:form:${formEl.id}`);
            if (!raw) return;
            const state = JSON.parse(raw);
            Object.keys(state).forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                el.value = state[id];
                // trigger change listeners if present
                const evt = new Event('change', { bubbles: true });
                el.dispatchEvent(evt);
            });
        } catch (e) {
            console.warn('Failed to restore form state', e);
        }
    }

    // Attach persistence handlers to all calculator forms
    document.querySelectorAll('.calc-form').forEach(formEl => {
        // Restore saved values on load
        restoreFormState(formEl);

        // Save on input/change
        formEl.querySelectorAll('input[id], select[id], textarea[id]').forEach(el => {
            el.addEventListener('input', () => saveFormState(formEl));
            el.addEventListener('change', () => saveFormState(formEl));
        });
    });

    // Heart Disease Calculator Submission
    document.getElementById("formHeart").addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = {
            age: parseFloat(document.getElementById("hrtAge").value) || 45,
            sex: parseFloat(document.getElementById("hrtSex").value),
            cp: parseFloat(document.getElementById("hrtCp").value),
            trestbps: parseFloat(document.getElementById("hrtBps").value) || 120,
            chol: parseFloat(document.getElementById("hrtChol").value) || 200,
            fbs: parseFloat(document.getElementById("hrtFbs").value),
            restecg: parseFloat(document.getElementById("hrtRestecg").value),
            thalach: parseFloat(document.getElementById("hrtThalach").value) || 150,
            exang: parseFloat(document.getElementById("hrtExang").value),
            oldpeak: parseFloat(document.getElementById("hrtOldpeak").value) || 0,
            slope: parseFloat(document.getElementById("hrtSlope").value),
            ca: parseFloat(document.getElementById("hrtCa").value),
            thal: parseFloat(document.getElementById("hrtThal").value)
        };

        try {
            const res = await fetch(`${API_BASE}/api/predict/heart`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                const data = await res.json();
                showRiskResult("Coronary Heart Disease", data.risk_percentage);
            } else {
                alert("Failed to calculate heart risk.");
            }
        } catch (err) {
            alert("Connection error.");
        }
    });

    // Kidney Disease Calculator Submission
    document.getElementById("formKidney").addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = {
            age: parseFloat(document.getElementById("kdnAge").value) || 45,
            bp: parseFloat(document.getElementById("kdnBp").value) || 80,
            sg: parseFloat(document.getElementById("kdnSg").value) || 1.020,
            al: parseFloat(document.getElementById("kdnAl").value) || 0,
            su: parseFloat(document.getElementById("kdnSu").value) || 0,
            rbc: document.getElementById("kdnRbc").value,
            pc: document.getElementById("kdnPc").value,
            pcc: document.getElementById("kdnPcc").value,
            ba: document.getElementById("kdnBa").value,
            bgr: parseFloat(document.getElementById("kdnBgr").value) || 121,
            bu: parseFloat(document.getElementById("kdnBu").value) || 46,
            sc: parseFloat(document.getElementById("kdnSc").value) || 1.2,
            sod: parseFloat(document.getElementById("kdnSod").value) || 138,
            pot: parseFloat(document.getElementById("kdnPot").value) || 4.4,
            hemo: parseFloat(document.getElementById("kdnHemo").value) || 15.0,
            pcv: parseFloat(document.getElementById("kdnPcv").value) || 40,
            wc: parseFloat(document.getElementById("kdnWc").value) || 8400,
            rc: parseFloat(document.getElementById("kdnRc").value) || 4.8,
            htn: document.getElementById("kdnHtn").value,
            dm: document.getElementById("kdnDm").value,
            cad: document.getElementById("kdnCad").value,
            appet: document.getElementById("kdnAppet").value,
            pe: document.getElementById("kdnPe").value,
            ane: document.getElementById("kdnAne").value
        };

        try {
            const res = await fetch(`${API_BASE}/api/predict/kidney`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                const data = await res.json();
                showRiskResult("Chronic Kidney Disease", data.risk_percentage);
            } else {
                alert("Failed to calculate kidney risk.");
            }
        } catch (err) {
            alert("Connection error.");
        }
    });

    // Thyroid Disease Calculator Submission
    document.getElementById("formThyroid").addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = {
            age: parseFloat(document.getElementById("thyAge").value) || 40,
            sex: document.getElementById("thySex").value,
            on_thyroxine: document.getElementById("thyThyroxine").value,
            query_on_thyroxine: "f",
            on_antithyroid_meds: "f",
            sick: document.getElementById("thySick").value,
            pregnant: document.getElementById("thyPregnant").value,
            thyroid_surgery: document.getElementById("thySurgery").value,
            I131_treatment: "f",
            query_hypothyroid: "f",
            query_hyperthyroid: "f",
            lithium: "f",
            goitre: document.getElementById("thyGoitre").value,
            tumor: document.getElementById("thyTumor").value,
            hypopituitary: "f",
            psych: "f",
            TSH: parseFloat(document.getElementById("thyTSH").value) || 1.4,
            T3: parseFloat(document.getElementById("thyT3").value) || 2.0,
            TT4: parseFloat(document.getElementById("thyTT4").value) || 108,
            T4U: parseFloat(document.getElementById("thyT4U").value) || 0.98,
            FTI: parseFloat(document.getElementById("thyFTI").value) || 110
        };

        try {
            const res = await fetch(`${API_BASE}/api/predict/thyroid`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                const data = await res.json();
                showRiskResult("Thyroid Disease", data.risk_percentage);
            } else {
                alert("Failed to calculate thyroid risk.");
            }
        } catch (err) {
            alert("Connection error.");
        }
    });


    // ----------------------------------------------------
    // Chronological Insights (Age-Decade Timeline)
    // ----------------------------------------------------
    const timelineDetails = document.getElementById("timelineDetails");
    const timelineSteps = document.querySelectorAll(".timeline-step");

    const decadeData = {
        "20": {
            title: "Early Adulthood (20s - 30s) Risks",
            desc: "Risk index scores are generally low, but endocrine anomalies like thyroid conditions are highly diagnosed during this chronological phase.",
            diseases: [
                "Thyroid Dysfunctions (Hypo/Hyperthyroidism, Graves', Hashimoto's)",
                "Allergic Rhinitis and Environmental Asthma",
                "Metabolic syndrome risks (early lifestyle choices affect later decades)"
            ],
            screenings: [
                "Thyroid panel (TSH, free T4) if experiencing unexplained weight/mood fluctuations.",
                "Fasting glucose checks to set baseline markers.",
                "Annual blood pressure screenings."
            ]
        },
        "40": {
            title: "Mid-Life Chronological Phase (40s - 50s)",
            desc: "Metabolic rates stabilize, signaling the progressive onset of cardiovascular stress, Type-2 diabetes, and early hormonal changes.",
            diseases: [
                "Type-2 Diabetes Mellitus (Glucose regulation issues)",
                "Early Stage Coronary Heart Disease (Plaque buildup)",
                "Hypertension (Chronic high blood pressure)"
            ],
            screenings: [
                "Lipid profile (Cholesterol, LDL, HDL, Triglycerides) every 2 years.",
                "Fasting Blood Glucose or HbA1c test annually.",
                "Cardiac stress test if chest pain symptoms appear."
            ]
        },
        "60": {
            title: "Advanced Chronological Phase (60s)",
            desc: "Cardiovascular and renal pathways experience long-term wear. Chronic kidney and artery disease risk scales rise rapidly in this stage.",
            diseases: [
                "Chronic Kidney Disease (CKD - reduced filtration efficiency)",
                "Advanced Atherosclerotic Heart Disease",
                "Joint Inflammation and Osteoarthritis"
            ],
            screenings: [
                "Glomerular Filtration Rate (eGFR) and serum creatinine check annually.",
                "Regular Electrocardiograms (ECGs) to detect silent rhythm changes.",
                "Bone Density Scan (DEXA) for osteoporosis baselines."
            ]
        },
        "70": {
            title: "Geriatric Chronological Phase (70s+)",
            desc: "Progressive neurological decay and cognitive decline conditions display peak prevalence rates. High risk of cardiovascular events.",
            diseases: [
                "Alzheimer's Disease & Age-Related Dementia",
                "Stroke / Transient Ischemic Attacks (TIAs)",
                "Severe Osteoporosis & vascular calcification"
            ],
            screenings: [
                "Cognitive assessment tests during annual checkups.",
                "Stroke risk panel: Carotid artery ultrasound screenings.",
                "Bone mineral density evaluation every 2 years."
            ]
        }
    };

    function renderDecade(dec) {
        const data = decadeData[dec];
        if (!data) return;

        let listHtml = "";
        data.screenings.forEach(scr => {
            listHtml += `<li>${scr}</li>`;
        });

        timelineDetails.innerHTML = `
            <div class="timeline-card">
                <h3>✦ ${data.title}</h3>
                <p>${data.desc}</p>
                <p><strong>Primary Chronological Conditions:</strong> ${data.diseases.join(", ")}</p>
                <p style="margin-bottom: 6px;"><strong>Recommended Diagnostics Timeline:</strong></p>
                <ul class="timeline-checklist">
                    ${listHtml}
                </ul>
            </div>
        `;
    }

    timelineSteps.forEach(step => {
        step.addEventListener("click", () => {
            timelineSteps.forEach(s => s.classList.remove("active"));
            step.classList.add("active");
            renderDecade(step.getAttribute("data-decade"));
        });
    });

    // Render default decade (20s)
    renderDecade("20");


    // ----------------------------------------------------
    // PWA Install Prompt Handler
    // ----------------------------------------------------
    let deferredPrompt = null;
    const installBanner = document.getElementById("installBanner");
    const btnInstallApp = document.getElementById("btnInstallApp");
    const btnCancelInstall = document.getElementById("btnCancelInstall");

    window.addEventListener("beforeinstallprompt", (e) => {
        // Prevent default browser install dialog
        e.preventDefault();
        deferredPrompt = e;
        // Show our custom accessible install banner
        installBanner.style.display = "flex";
    });

    btnInstallApp.addEventListener("click", async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`User installation outcome: ${outcome}`);
            deferredPrompt = null;
            installBanner.style.display = "none";
        }
    });

    btnCancelInstall.addEventListener("click", () => {
        installBanner.style.display = "none";
    });
});
