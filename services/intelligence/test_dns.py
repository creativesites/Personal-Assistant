import socket

try:
    print("Default resolution:")
    print(socket.getaddrinfo("aws-0-eu-west-1.pooler.supabase.com", 5432))
except Exception as e:
    print("Default resolution failed:", e)

try:
    print("IPv4 only resolution:")
    print(socket.getaddrinfo("aws-0-eu-west-1.pooler.supabase.com", 5432, family=socket.AF_INET))
except Exception as e:
    print("IPv4 only resolution failed:", e)
