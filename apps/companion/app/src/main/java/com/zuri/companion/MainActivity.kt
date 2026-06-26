package com.zuri.companion

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationManagerCompat
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputEditText
import android.widget.TextView
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    private lateinit var tokenManager: TokenManager
    private lateinit var tvStatus: TextView
    private lateinit var btnEnablePermission: MaterialButton
    private lateinit var etApiUrl: TextInputEditText
    private lateinit var etToken: TextInputEditText

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        tokenManager = TokenManager(this)

        tvStatus = findViewById(R.id.tvStatus)
        btnEnablePermission = findViewById(R.id.btnEnablePermission)
        etApiUrl = findViewById(R.id.etApiUrl)
        etToken = findViewById(R.id.etToken)

        etApiUrl.setText(tokenManager.apiUrl)
        etToken.setText(tokenManager.authToken)

        btnEnablePermission.setOnClickListener {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }

        findViewById<MaterialButton>(R.id.btnSave).setOnClickListener {
            val url = etApiUrl.text?.toString()?.trim() ?: ""
            val token = etToken.text?.toString()?.trim() ?: ""

            if (url.isBlank() || token.isBlank()) {
                Toast.makeText(this, "API URL and token are required", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            tokenManager.apiUrl = url
            tokenManager.authToken = token
            Toast.makeText(this, getString(R.string.settings_saved), Toast.LENGTH_SHORT).show()
        }
    }

    override fun onResume() {
        super.onResume()
        updateStatus()
    }

    private fun updateStatus() {
        val hasPermission = NotificationManagerCompat.getEnabledListenerPackages(this)
            .contains(packageName)

        if (hasPermission) {
            tvStatus.text = getString(R.string.status_active)
            tvStatus.setBackgroundColor(ContextCompat.getColor(this, R.color.status_active))
            btnEnablePermission.isEnabled = false
        } else {
            tvStatus.text = getString(R.string.status_inactive)
            tvStatus.setBackgroundColor(ContextCompat.getColor(this, R.color.status_inactive))
            btnEnablePermission.isEnabled = true
        }
    }
}
