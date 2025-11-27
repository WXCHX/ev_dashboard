// fullgraph.js
document.addEventListener('DOMContentLoaded', () => {

    // ******************************************************
    // ** 1. SUPABASE CONFIGURATION **
    // ******************************************************
    // !!! กรุณาแทนที่ด้วยค่าจริงของคุณ !!!
    const SUPABASE_URL = 'https://cxbpdghmlfqmwznixxtd.supabase.co'; 
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4YnBkZ2htbGZxbXd6bml4eHRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5NTM4ODUsImV4cCI6MjA3ODUyOTg4NX0.IWLpElU21MMcW9WuokO4CMu7TSJhNqJBM_DzHe9N6-I'; 
    const TABLE_NAME = 'telemetry_points'; // ชื่อตาราง
    
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    let telemetryData = null; // Cache ข้อมูล

    // ******************************************************
    // ** 2. GRAPH CONFIGURATION (แก้ไขชื่อคอลัมน์ให้ตรงกับ DB) **
    // ******************************************************
    const GRAPH_PAIRS = [
        // LINE CHARTS (vs Time)
        { id: 'SOC_vs_Time', name: 'SOC vs Time', y_column: 'soc', y_label: 'SOC (%)', color: 'rgb(54, 162, 235)', y_min: 0, y_max: 100 }, // FIXED: soc_percent -> soc
        { id: 'TempBattery_vs_Time', name: 'Temp Battery vs Time', y_column: 'temp_batt', y_label: 'Temp (°C)', color: 'rgb(255, 99, 132)', y_min: 20, y_max: 50 }, // FIXED: temp_batt_c -> temp_batt
        { id: 'Current_vs_Time', name: 'Current vs Time', y_column: 'pack_current', y_label: 'Current (A)', color: 'rgb(75, 192, 192)', y_min: 0, y_max: 300 }, // FIXED: current_a -> pack_current
        { id: 'Voltage_vs_Time', name: 'Voltage vs Time', y_column: 'batt_volt', y_label: 'Voltage (V)', color: 'rgb(255, 205, 86)', y_min: 380, y_max: 420 }, // FIXED: voltage -> batt_volt

        // Multi-Dataset (ใช้ pack_power เป็น input และ derived output)
        { id: 'Power_Efficiency', name: 'Power Elec vs Power Out', y_column: ['pack_power'], y_label: ['Power Input (W)', 'Power Output (W)'], color: ['rgb(255, 99, 132)', 'rgb(54, 162, 235)'], y_min: 0, y_max: 100000, multi_dataset: true }, 

        // MOTOR SELECT GRAPHS
        { id: "RPM_vs_Time_Motors", name: "RPM vs Time (All Motors)", kind: "motor_select", y_label: "RPM", y_min: 0, y_max: 8000, base_column: 'rpm', motor_type: 'rpm', colors: ['rgb(255, 159, 64)', 'rgb(255, 99, 132)', 'rgb(54, 162, 235)', 'rgb(75, 192, 192)'], },
        { id: "TempMotor_vs_Time_Motors", name: "Temp Motor vs Time (All Motors)", kind: "motor_select", y_label: "Temp Motor (°C)", y_min: 20, y_max: 140, base_column: 'temp_motor', motor_type: 'temp', colors: ['rgb(100, 255, 100)', 'rgb(255, 159, 64)', 'rgb(255, 99, 132)', 'rgb(54, 162, 235)'], },

        // Scatter Plots (ใช้ชื่อคอลัมน์ที่ถูกต้อง)
        { id: 'Temp_vs_Current', name: 'Temp Motor vs Current', x_column: 'pack_current', y_column: 'temp_motor_max', y_label: 'Temp (°C)', x_label: 'Current (A)', color: 'rgb(75, 192, 192)', y_min: 25, y_max: 40, chart_type: 'scatter' }, // FIXED: x_column
        { id: 'Voltage_vs_Current', name: 'Voltage vs Current', x_column: 'pack_current', y_column: 'batt_volt', y_label: 'Voltage (V)', x_label: 'Current (A)', color: 'rgb(153, 102, 255)', y_min: 380, y_max: 420, chart_type: 'scatter' }, // FIXED: x_column, y_column
        { id: 'RPM_vs_TempMotor', name: 'RPM vs Temp Motor', x_column: 'temp_motor_max', y_column: 'rpm_avg', y_label: 'RPM', x_label: 'Temp (°C)', color: 'rgb(255, 159, 64)', y_min: 0, y_max: 6000, chart_type: 'scatter' },
    ];
    
    const MOTOR_KEYS = ['fl', 'fr', 'rl', 'rr']; 

    // ******************************************************
    // ** 3. Element References (ไม่มีการเปลี่ยนแปลง) **
    // ******************************************************
    const toggleBtn = document.getElementById('toggleDropdown');
    const graphDropdown = document.getElementById('graphDropdown');
    const checkboxList = document.getElementById('checkboxList');
    const mainGridContainer = document.getElementById('mainGridContainer');

    // ******************************************************
    // ** 4. UTILITIES (ไม่มีการเปลี่ยนแปลง) **
    // ******************************************************
    function formatTimeLabel(iso) {
        if (!iso) return "";
        return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }

    function calculateMotorData(data) {
        return data.map(row => {
            const rpms = [row.rpm_fl ?? 0, row.rpm_fr ?? 0, row.rpm_rl ?? 0, row.rpm_rr ?? 0];
            const temps = [row.temp_motor_fl ?? -9999, row.temp_motor_fr ?? -9999, row.temp_motor_rl ?? -9999, row.temp_motor_rr ?? -9999];
            
            return {
                ...row,
                rpm_avg: rpms.reduce((a, b) => a + b, 0) / 4,
                temp_motor_max: Math.max(...temps.filter(t => t > -9000)),
            };
        });
    }

    // ******************************************************
    // ** 5. LOAD DATA (แก้ไขคอลัมน์ที่ Select) **
    // ******************************************************
    async function loadDataIfNeeded() {
        if (telemetryData && telemetryData.length) return telemetryData;

        // ดึงคอลัมน์ทั้งหมดที่จำเป็นสำหรับการ Plot
        const { data, error } = await supabase
            .from(TABLE_NAME)
            .select(`
                created_at,
                soc, temp_batt, pack_current, batt_volt, pack_power, 
                rpm_fl, rpm_fr, rpm_rl, rpm_rr,
                temp_motor_fl, temp_motor_fr, temp_motor_rl, temp_motor_rr
            `)
            .order("created_at", { ascending: true });

        if (error) {
            console.error("Supabase error:", error.message);
            return [];
        }
        
        telemetryData = calculateMotorData(data || []); 
        return telemetryData;
    }


    // ******************************************************
    // ** 6. CHART RENDERING FUNCTION (ไม่มีการเปลี่ยนแปลง) **
    // ******************************************************
    function renderChart(canvasId, labels, datasets, yTitle, chartType = 'line', yMin, yMax, xTitle) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return; 
        
        const existingChart = Chart.getChart(canvasId);
        if (existingChart) existingChart.destroy();
        
        new Chart(ctx, {
            type: chartType,
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: { labels: { color: '#E2E8F0' } }, 
                },
                scales: {
                    y: {
                        min: yMin,
                        max: yMax,
                        title: { display: true, text: yTitle, color: '#E2E8F0' },
                        ticks: { color: '#94A3B8' },
                        grid: { color: 'rgba(51,65,85,0.4)' }
                    },
                    x: {
                        type: chartType === 'scatter' ? 'linear' : 'category',
                        title: { display: true, text: xTitle, color: '#E2E8F0' },
                        ticks: { color: '#94A3B8' },
                        grid: { color: 'rgba(51,65,85,0.4)' }
                    }
                }
            }
        });
    }


    // ******************************************************
    // ** 7. DATA FETCHING AND PLOTTING FUNCTION (แก้ไขเล็กน้อย) **
    // ******************************************************
    async function fetchAndPlotGraph(graphId) {
        const cfg = GRAPH_PAIRS.find(p => p.id === graphId);
        if (!cfg) return;

        const { y_column, x_column, multi_dataset, y_label, color, y_min, y_max, x_label, chart_type } = cfg;

        const data = await loadDataIfNeeded();
        if (!data || !data.length) {
             const errorCard = document.getElementById(`${graphId}_chart`).closest('.card-placeholder');
             if (errorCard) errorCard.innerHTML = `<h3 style="color:#F87171" class="text-center">Error: No data available.</h3>`;
             return;
        }

        let labels = [];
        const datasets = [];
        
        // ตรรกะ Motor Selection
        if (cfg.kind === "motor_select") {
            labels = data.map((row) => formatTimeLabel(row.created_at));
            
            MOTOR_KEYS.forEach((motorKey, index) => {
                const columnName = `${cfg.base_column}_${motorKey}`; 

                datasets.push({
                    label: `${cfg.y_label} (${motorKey.toUpperCase()})`,
                    data: data.map((row) => row[columnName] ?? null),
                    borderColor: cfg.colors[index % cfg.colors.length],
                    backgroundColor: cfg.colors[index % cfg.colors.length].replace('rgb', 'rgba').replace(')', ', 0.3)'),
                    borderWidth: 2, tension: 0.15, pointRadius: 0, fill: false,
                });
            });

        } else if (chart_type === 'scatter') {
            // SCATTER PLOT
            const points = data.map(row => ({ x: row[x_column], y: row[y_column] })).filter(p => p.x != null && p.y != null);
            datasets.push({
                label: y_label,
                data: points,
                borderColor: color,
                backgroundColor: color.replace('rgb', 'rgba').replace(')', ', 0.6)'), 
                showLine: false, 
                pointRadius: 5
            });
            labels = data.map(row => row[x_column]); 
            
        } else if (multi_dataset) {
            // MULTI-DATASET (Power Efficiency)
            labels = data.map(row => formatTimeLabel(row.created_at));
            cfg.y_column.forEach((col, index) => {
                // สำหรับ Power Efficiency, เราใช้ pack_power เป็นคอลัมน์เดียว
                let rowData = data.map(row => row.pack_power ?? null);
                let derivedLabel = cfg.y_label[index];
                
                // สำหรับ Power Output (สมมติว่าเป็น derived value จาก pack_power)
                if (index === 1) {
                    rowData = data.map(row => row.pack_power != null ? row.pack_power * 0.95 : null);
                }

                datasets.push({
                    label: derivedLabel,
                    data: rowData,
                    borderColor: color[index],
                    backgroundColor: color[index].replace('rgb', 'rgba').replace(')', ', 0.3)'), 
                    tension: 0.3,
                    fill: false,
                    pointRadius: 2
                });
            });

        } else {
            // LINE CHART (vs Time)
            labels = data.map(row => formatTimeLabel(row.created_at));
            datasets.push({
                label: y_label,
                data: data.map(row => row[y_column] ?? null),
                borderColor: color,
                backgroundColor: color.replace('rgb', 'rgba').replace(')', ', 0.5)'),
                tension: 0.3,
                pointRadius: 3,
                fill: false,
            });
        }
        
        // 4. วาดกราฟ
        renderChart(
            `${cfg.id}_chart`,
            labels,
            datasets,
            cfg.y_label, 
            cfg.chart_type || 'line', 
            cfg.y_min,
            cfg.y_max,
            cfg.chart_type === 'scatter' ? cfg.x_label : 'Time' 
        );
    }

    // ******************************************************
    // ** 8. CORE LOGIC (ไม่มีการเปลี่ยนแปลง) **
    // ******************************************************

    function renderCheckboxes() {
        checkboxList.innerHTML = "";
        GRAPH_PAIRS.forEach(pair => {
            const label = document.createElement('label');
            // ใช้คลาส Tailwind ภายใน String (เพื่อรองรับการ Compile ด้วย Tailwind CLI)
            label.className = 'flex items-center space-x-2 text-gray-200 cursor-pointer hover:bg-gray-700 p-2 rounded-md'; 
            label.innerHTML = `
                <input type="checkbox" value="${pair.id}" data-name="${pair.name}" class="form-checkbox h-5 w-5 text-blue-600 rounded">
                <span>${pair.name}</span>
            `;
            checkboxList.appendChild(label);
        });
    }

    function updateGraphs() {
        const selectedCheckboxes = Array.from(checkboxList.querySelectorAll('input:checked'));
        const selectedGraphs = selectedCheckboxes.map(cb => ({ id: cb.value, name: cb.dataset.name }));
        const count = selectedGraphs.length;
        
        // A. ปรับโครงสร้าง Grid (Layout)
        mainGridContainer.className = 'grid w-screen h-full gap-6 p-6 min-h-screen'; 
        
        if (count === 0) {
            // ใช้คลาส Tailwind
            mainGridContainer.innerHTML = `<h2 class="col-span-full text-gray-500 text-3xl text-center mt-20">กรุณาเลือกคู่เปรียบเทียบจากปุ่ม Edit Graph</h2>`;
            return;
        }
        
        // จัดการ Grid Layout โดยใช้คลาส Tailwind
        mainGridContainer.classList.remove('grid-cols-1', 'grid-cols-2', 'grid-cols-3');
        if (count === 1) {
            mainGridContainer.classList.add('grid-cols-1');
        } else if (count <= 3) {
            mainGridContainer.classList.add('grid-cols-2');
        } else { 
            mainGridContainer.classList.add('grid-cols-3');
        }

        // B. สร้าง Card กราฟใหม่ และเรียก Plot
        mainGridContainer.innerHTML = ''; 
        selectedGraphs.forEach(graph => {
            const graphCard = document.createElement('div');
            // ใช้คลาส Tailwind ใน Card Placeholder
            graphCard.className = 'card-placeholder flex flex-col'; 

            let cardHeight;
            if (count <= 3) { cardHeight = '60vh'; } 
            else if (count <= 6) { cardHeight = '45vh'; } 
            else { cardHeight = '35vh'; }
            
            graphCard.style.height = cardHeight;
            graphCard.dataset.graphId = graph.id; 

            // *** ใช้คลาส Tailwind (ตามที่ผู้ใช้ต้องการ) ***
            graphCard.innerHTML = `
                <div class="flex justify-between items-center w-full mb-2">
                    <h3 class="text-white text-xl font-semibold">${graph.name}</h3>
                    <button class="text-gray-400 hover:text-red-400 text-2xl leading-none" onclick="window.removeGraph('${graph.id}')">
                        &times;
                    </button>
                </div>
                <div class="relative w-full h-full p-0"> 
                    <canvas id="${graph.id}_chart"></canvas> 
                    <div class="graph-error absolute inset-0 flex items-center justify-center text-red-500 text-sm hidden"></div>
                </div>
            `;
            
            mainGridContainer.appendChild(graphCard);
            
            fetchAndPlotGraph(graph.id);
        });
    }

    // 9. ฟังก์ชันสำหรับลบกราฟ
    window.removeGraph = function(graphId) { 
        const checkbox = checkboxList.querySelector(`input[value="${graphId}"]`);
        if (checkbox) {
            checkbox.checked = false; 
            updateGraphs();
        }
    }

    // 10. INITIALIZATION & Events
    renderCheckboxes(); 
    updateGraphs();

    if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            graphDropdown.classList.toggle('hidden');
        });
    }

    checkboxList.addEventListener('change', updateGraphs);
    
    document.addEventListener('click', (e) => {
        if (graphDropdown && toggleBtn && !graphDropdown.contains(e.target) && !toggleBtn.contains(e.target)) {
            graphDropdown.classList.add('hidden');
        }
    });
});