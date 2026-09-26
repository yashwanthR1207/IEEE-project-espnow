const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { createClient } = require('@supabase/supabase-js');

// 1. Point these to your Supabase Project Settings > API
const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY'; // Use the anon/public key

if (SUPABASE_URL.includes("YOUR_PROJECT_ID")) {
    console.error("❌ ERROR: You must edit bridge.js and insert your SUPABASE_URL and SUPABASE_KEY!");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function startBridge() {
    console.log("🔍 Scanning for connected ESP32...");
    
    // Auto-detect the ESP32!
    const ports = await SerialPort.list();
    
    // Look for common ESP32 USB chipsets
    let espPortPath = null;
    for (const port of ports) {
        // CH340, CP210x, FTDI are common ESP32 USB chips
        if (
            (port.manufacturer && port.manufacturer.includes("Silicon Labs")) ||
            (port.manufacturer && port.manufacturer.includes("wch")) ||
            (port.manufacturer && port.manufacturer.includes("FTDI")) ||
            port.path.includes("usbserial") || 
            port.path.includes("SLAB")
        ) {
            espPortPath = port.path;
            break;
        }
    }

    if (!espPortPath) {
        // Fallback: If we couldn't auto-detect, just use the last available port
        if (ports.length > 0) {
            espPortPath = ports[ports.length - 1].path;
            console.log("⚠️ Couldn't positively identify an ESP32, guessing it is on: " + espPortPath);
        } else {
            console.log("❌ ERROR: No USB devices found! Is the ESP32 plugged in?");
            process.exit(1);
        }
    } else {
        console.log("✅ ESP32 Auto-Detected on port: " + espPortPath);
    }

    const port = new SerialPort({ path: espPortPath, baudRate: 115200 }, function (err) {
      if (err) {
        return console.log('❌ Error opening serial port: ', err.message);
      }
    });

    const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

    console.log("📡 Listening to ESP32...");

    let currentData = {
        temperature: 0, humidity: 0, flame: 0, water: 0, path: ""
    };

    parser.on('data', async (line) => {
        console.log("ESP32:", line);
        
        if(line.includes("TEMPERATURE :")) {
            currentData.temperature = parseFloat(line.split(":")[1].trim());
        }
        else if(line.includes("HUMIDITY    :")) {
            currentData.humidity = parseFloat(line.split(":")[1].trim());
        }
        else if(line.includes("FLAME       :")) {
            currentData.flame = parseInt(line.split(":")[1].trim());
        }
        else if(line.includes("WATER       :")) {
            currentData.water = parseInt(line.split(":")[1].trim());
        }
        else if(line.includes("PATH        :")) {
            currentData.path = line.split(":")[1].trim();
            
            // Push to Supabase table "sensor_data"
            const { data, error } = await supabase
              .from('sensor_data')
              .insert([
                { 
                  temperature: currentData.temperature,
                  humidity: currentData.humidity,
                  flame: currentData.flame,
                  water: currentData.water,
                  path: currentData.path
                }
              ]);
              
            if (error) {
                console.error("❌ Supabase Error:", error.message);
            } else {
                console.log("✅ Data sent to Supabase!");
            }
        }
    });
}

startBridge();
