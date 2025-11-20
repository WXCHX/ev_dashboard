// scripts.js

// โค้ดทั้งหมดถูกห่อหุ้มด้วย DOMContentLoaded เพื่อรอให้ไลบรารีภายนอกและ DOM โหลดเสร็จก่อน
document.addEventListener('DOMContentLoaded', () => {

    // ******************************************************
    // ** 1. SUPABASE CONFIGURATION **
    // ******************************************************
    // !!! กรุณาแทนที่ด้วยค่าจริงของคุณ !!!
    const SUPABASE_URL = 'https://wlnqwxftqepkhozoyemu.supabase.co'; 
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsbnF3eGZ0cWVwa2hvem95ZW11Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzY1ODY0OCwiZXhwIjoyMDc5MjM0NjQ4fQ.LksQiUJb06rCNA357vR0ytXnqNpOUByaUDU9Tz1ASr4'; 
    
    // ใช้ window.supabase เพื่อเรียก Global object ที่ CDN สร้าง
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    // ******************************************************
    // ** 2. GRAPH CONFIGURATION (กำหนดคู่เปรียบเทียบและคอลัมน์) **
    // ******************************************************
    const GRAPH_PAIRS = [
        { id: 'SOC_vs_Time', name: 'SOC vs Time', y_column: 'soc_percent', y_label: 'SOC (%)', color: 'rgb(54, 162, 235)', y_min: 0, y_max: 100 },

        { id: 'TempBattery_vs_Time', name: 'Temp Battery vs Time', y_column: 'battery_temp_c', y_label: 'Temp (°C)', color: 'rgb(255, 99, 132)', y_min: 20, y_max: 50 },

        { id: 'Current_vs_Time', name: 'Current vs Time', y_column: 'current_a', y_label: 'Current (A)', color: 'rgb(75, 192, 192)', y_min: 0, y_max: 300 },

        { id: 'RPM_vs_Time', name: 'RPM vs Time', y_column: 'rpm', y_label: 'RPM', color: 'rgb(255, 159, 64)', y_min: 0, y_max: 6000 },
        
        { id: 'Power_Efficiency', name: 'Power Elec vs Power Out', y_column: ['power_elec', 'power_out'], y_label: ['Power Input (W)', 'Power Output (W)'], color: ['rgb(255, 99, 132)', 'rgb(54, 162, 235)'], y_min: 0, y_max: 100000, multi_dataset: true },

        { id: 'Voltage_vs_Time', name: 'Voltage vs Time', y_column: 'voltage', y_label: 'Voltage (V)', color: 'rgb(255, 205, 86)', y_min: 380, y_max: 420 },

        { id: 'Temp_vs_Current', name: 'Temp Motor vs Current', x_column: 'current_a', y_column: 'temp_motor', y_label: 'Temp (°C)', x_label: 'Current (A)', color: 'rgb(75, 192, 192)', y_min: 25, y_max: 40, chart_type: 'scatter' },

        { id: 'Voltage_vs_Current', name: 'Voltage vs Current', x_column: 'current_a', y_column: 'voltage', y_label: 'Voltage (V)', x_label: 'Current (A)', color: 'rgb(153, 102, 255)', y_min: 380, y_max: 420, chart_type: 'scatter' },

        { id: 'RPM_vs_TempMotor', name: 'RPM vs Temp Motor', x_column: 'temp_motor', y_column: 'rpm', y_label: 'RPM', x_label: 'Temp (°C)', color: 'rgb(255, 159, 64)', y_min: 0, y_max: 6000, chart_type: 'scatter' },
    ];

    // ******************************************************
    // ** 3. Element References **
    // ******************************************************
    const toggleBtn = document.getElementById('toggleDropdown');
    const dropdown = document.getElementById('graphDropdown');
    const checkboxList = document.getElementById('checkboxList');
    const mainGridContainer = document.getElementById('mainGridContainer');

    // ******************************************************
    // ** 4. CHART RENDERING FUNCTION **
    // ******************************************************
    function renderChart(canvasId, labels, datasets, yTitle, chartType = 'line', yMin, yMax, xTitle) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return; 
        
        const existingChart = Chart.getChart(canvasId);
        if (existingChart) {
            existingChart.destroy();
        }
        
        new Chart(ctx, {
            type: chartType,
            data: {
                labels: labels,
                datasets: datasets // ใช้ datasets ที่ถูกสร้างและกำหนดสีแล้ว
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: { labels: { color: 'white' } }
                },
                scales: {
                    y: {
                        min: yMin,
                        max: yMax,
                        title: {
                            display: true,
                            text: yTitle,
                            color: 'white'
                        },
                        ticks: { color: 'white' },
                        grid: { color: 'rgba(255,255,255,0.1)' }
                    },
                    x: {
                        title: {
                            display: true,
                            text: xTitle, // ใช้ xTitle ที่ส่งมา
                            color: 'white'
                        },
                        ticks: { color: 'white' },
                        grid: { color: 'rgba(255,255,255,0.1)' }
                    }
                }
            }
        });
    }

    // ******************************************************
    // ** 5. DATA FETCHING AND PLOTTING FUNCTION **
    // ******************************************************
    async function fetchAndPlotGraph(graphId) {
        const graphConfig = GRAPH_PAIRS.find(p => p.id === graphId);
        if (!graphConfig) return;

        const { y_column, x_column, multi_dataset, y_label, color, y_min, y_max, x_label, chart_type } = graphConfig;

        // 1. กำหนดคอลัมน์ที่จะ Query
        let selectColumns = ['timestamp'];
        if (multi_dataset) {
            selectColumns = selectColumns.concat(y_column);
        } else if (x_column) {
            selectColumns = [x_column, y_column]; 
            selectColumns = selectColumns.filter((v, i, a) => a.indexOf(v) === i); // Ensure unique columns
        } else {
            selectColumns.push(y_column);
        }
        
        // 2. ดึงข้อมูล
        const { data, error } = await supabase
            .from('ev_data')
            .select(selectColumns.join(', '))
            .order('timestamp', { ascending: true }); 

        if (error || !data) {
            console.error(`Error fetching data for ${graphId}:`, error);
            const errorCard = document.getElementById(`${graphId}_chart`).closest('.card-placeholder');
            if (errorCard) errorCard.innerHTML = `<h3 class="text-red-500 text-center">Error: Cannot load data. Check RLS or connection.</h3>`;
            return;
        }
        
        // 3. จัดรูปแบบข้อมูล (Formatting Data)
        let chartData = {};
        
        if (chart_type === 'scatter') {
            // SCATTER PLOT
            const datasets = [{
                label: y_label,
                data: data.map(row => ({ x: row[x_column], y: row[y_column] })),
                borderColor: color,
                backgroundColor: color.replace('rgb', 'rgba').replace(')', ', 0.6)'), 
                showLine: false, 
                pointRadius: 5
            }];
            chartData.datasets = datasets;
            chartData.labels = data.map(row => row[x_column]); 
            
        } else if (multi_dataset) {
            // MULTI-DATASET (Line Chart with multiple lines)
            const labels = data.map(row => new Date(row.timestamp).toLocaleTimeString());
            const datasets = y_column.map((col, index) => ({
                label: y_label[index],
                data: data.map(row => row[col]),
                borderColor: color[index],
                backgroundColor: color[index].replace('rgb', 'rgba').replace(')', ', 0.3)'), 
                tension: 0.3,
                fill: false,
                pointRadius: 2
            }));
            chartData.labels = labels;
            chartData.datasets = datasets;

        } else {
            // LINE CHART (vs Time)
            const labels = data.map(row => new Date(row.timestamp).toLocaleTimeString());
            chartData.labels = labels;
            chartData.datasets = [{
                label: y_label,
                data: data.map(row => row[y_column]),
                borderColor: color,
                backgroundColor: color.replace('rgb', 'rgba').replace(')', ', 0.5)'),
                tension: 0.3,
                pointRadius: 3,
                fill: false,
            }];
        }
        
        // 4. วาดกราฟ
        renderChart(
            `${graphId}_chart`,
            chartData.labels,
            chartData.datasets,
            y_label, 
            graphConfig.chart_type || 'line', 
            y_min,
            y_max,
            chart_type === 'scatter' ? x_label : 'Time' // กำหนดชื่อแกน X
        );
    }

    // ******************************************************
    // ** 6. CORE LOGIC (Checkbox, Layout, Rendering) **
    // ******************************************************

    function renderCheckboxes() {
        GRAPH_PAIRS.forEach(pair => {
            const label = document.createElement('label');
            label.className = 'flex items-center text-gray-200 cursor-pointer checkbox-label';
            label.innerHTML = `
                <input type="checkbox" value="${pair.id}" data-name="${pair.name}" class="form-checkbox h-5 w-5 text-blue-600 rounded mr-2">
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
            mainGridContainer.innerHTML = `<h2 class="col-span-3 text-gray-500 text-3xl text-center mt-20">กรุณาเลือกคู่เปรียบเทียบที่ต้องการแสดงผล</h2>`;
            return;
        }
        
        if (count === 1) {
            mainGridContainer.classList.add('grid-cols-1');
        } else if (count === 2 || count === 3) {
            mainGridContainer.classList.add('grid-cols-2');
        } else { 
            mainGridContainer.classList.add('grid-cols-3');
        }

        // B. สร้าง Card กราฟใหม่ และเรียก Plot
        mainGridContainer.innerHTML = ''; 
        selectedGraphs.forEach(graph => {
            const graphCard = document.createElement('div');
            graphCard.className = 'card-placeholder flex flex-col'; 

            let cardHeight;
            if (count <= 3) {
                cardHeight = '60vh'; 
            } else if (count <= 6) {
                cardHeight = '45vh'; 
            } else {
                cardHeight = '35vh'; 
            }
            
            graphCard.style.height = cardHeight;
            graphCard.innerHTML = `
                <div class="flex justify-between w-full mb-2">
                    <h3 class="text-white text-xl font-semibold">${graph.name}</h3>
                    <button class="text-gray-400 hover:text-red-400 text-2xl" onclick="removeGraph('${graph.id}')">
                        &times;
                    </button>
                </div>
                <div class="w-full h-full p-0"> 
                <canvas id="${graph.id}_chart"></canvas> 
                </div>
            `;
            
            mainGridContainer.appendChild(graphCard);
            
            // เรียกฟังก์ชันดึงข้อมูลและ Plot กราฟ
            fetchAndPlotGraph(graph.id);
        });
    }

    // 7. ฟังก์ชันสำหรับลบกราฟ (จากปุ่ม X ภายใน Card)
    window.removeGraph = function(graphId) { 
        const checkbox = checkboxList.querySelector(`input[value="${graphId}"]`);
        if (checkbox) {
            checkbox.checked = false; 
            updateGraphs();
        }
    }

    // 8. INITIALIZATION
    renderCheckboxes(); 
    updateGraphs();

    // 9. Event Listeners
    if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('hidden');
        });
    }

    checkboxList.addEventListener('change', updateGraphs);
    
    // ปิด Dropdown เมื่อคลิกที่อื่น
    document.addEventListener('click', (e) => {
        if (dropdown && toggleBtn && !dropdown.contains(e.target) && !toggleBtn.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });
});