package com.stoya.tavernrev

import android.app.Application
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import androidx.core.content.FileProvider
import java.io.File

class TavernApplication : Application() {
    override fun onCreate() {
        super.onCreate()
    }

    @androidx.annotation.Keep
    fun installApk(filePath: String) {
        Handler(Looper.getMainLooper()).post {
            try {
                val file = File(filePath)
                if (!file.exists()) {
                    Toast.makeText(this, "APK file not found on disk: $filePath", Toast.LENGTH_LONG).show()
                    return@post
                }
                
                val uri = FileProvider.getUriForFile(this, "${packageName}.fileprovider", file)
                val intent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                startActivity(intent)
            } catch (e: Throwable) {
                e.printStackTrace()
                Toast.makeText(this, "Install failed: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }
}
