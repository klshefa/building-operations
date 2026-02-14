import { NextResponse } from 'next/server'

const RESEND_API_KEY = process.env.RESEND_API_KEY

export async function POST(request: Request) {
  try {
    // Send via Resend
    if (!RESEND_API_KEY) {
      return NextResponse.json({ error: 'Resend API key not configured' }, { status: 500 })
    }
    
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Building Operations <ops@shefaschool.org>',
        to: ['keith.lowry@shefaschool.org'],
        subject: '[TEST] Building Operations Email Test',
        html: `
          <html>
          <body style="font-family: sans-serif; padding: 20px;">
            <h1>Test Email</h1>
            <p>This is a test email from Building Operations.</p>
            <p>Sent at: ${new Date().toISOString()}</p>
          </body>
          </html>
        `
      })
    })
    
    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json({ error: `Email send failed: ${error}` }, { status: 500 })
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Test email sent'
    })
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
