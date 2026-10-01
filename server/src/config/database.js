import mongoose from 'mongoose';

export const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  const localFallbackUri = 'mongodb://127.0.0.1:27017/proctorshield';

  if (!uri) {
    console.warn('⚠️ MONGODB_URI is not defined. Attempting local MongoDB connection...');
    try {
      const conn = await mongoose.connect(localFallbackUri, { serverSelectionTimeoutMS: 4000 });
      console.log(`✅ MongoDB Connected (Local Fallback): ${conn.connection.host}`);
      return true;
    } catch (err) {
      console.error(`❌ Local MongoDB Connection Error: ${err.message}`);
      return false;
    }
  }

  try {
    const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    return true;
  } catch (error) {
    console.error(`❌ Primary MongoDB Connection Error: ${error.message}`);
    // If primary was Atlas and failed, try local fallback
    if (uri !== localFallbackUri) {
      console.log('🔄 Attempting local MongoDB fallback at mongodb://127.0.0.1:27017/proctorshield...');
      try {
        const fallbackConn = await mongoose.connect(localFallbackUri, { serverSelectionTimeoutMS: 4000 });
        console.log(`✅ MongoDB Connected (Local Fallback): ${fallbackConn.connection.host}`);
        return true;
      } catch (fallbackError) {
        console.error(`❌ Local Fallback Connection Error: ${fallbackError.message}`);
      }
    }
    return false;
  }
};

export const getDBStatus = () => {
  const state = mongoose.connection.readyState;
  switch (state) {
    case 1:
      return 'connected';
    case 2:
      return 'connecting';
    case 3:
      return 'disconnecting';
    default:
      return 'disconnected';
  }
};
