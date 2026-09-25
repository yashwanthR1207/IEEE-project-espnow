const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { createClient } = require('@supabase/supabase-js');

// 1. Point these to your Supabase Project Settings > API
const SUPABASE_URL = 'https://bojntxbipkgnprqsxmck.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvam50eGJpcGtnbnBycXN4bWNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNjQ2MDAsImV4cCI6MjEwNTk0MDYwMH0.V1XO6vqaJEB9_Cpak5s5IGOx43qkLgt9wXzrXO_9qNE'; // Use the anon/public key

if (SUPABASE_URL.includes("YOUR_PROJECT_ID")) {
    console.error("❌ ERROR: You must edit bridge.js and insert your SUPABASE_URL and SUPABASE_KEY!");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 2. Change this to your exact ESP32 COM/tty port!
const SERIAL_PORT = '/dev/tty.usbserial-0001'; 

const port = new SerialPort({ path: SERIAL_PORT, baudRate: 115200 }, function (err) {
  if (err) {
    return console.log('❌ Error opening serial port: ', err.message);
  }
});

const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

console.log("Listening to ESP32 on Serial Port " + SERIAL_PORT + "...");

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
        
        // At the end of the block, push to Supabase table "sensor_data"
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
            console.log("✅ Data sent to Supabase Database!");
        }
    }
});
