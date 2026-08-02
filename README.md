Crear un contenedor en dokers para mongoo:
docker run -d --name mongo-prestamesta -p 27017:27017 mongo


Solo existen 'SUPERADMIN', 'ANALISTA', 'COBRADOR' como roles de administrador


Endpoints Aministrador

Registro Admin (POST http://localhost:3000/admin/auth/register)

JSON
{
  "nombre": "Admin Principal",
  "email": "admin@prestamesta.com",
  "password": "AdminSuperSeguro123",
  "rol": "SUPERADMIN"
}
Login Admin (POST http://localhost:3000/admin/auth/login)

JSON
{
  "email": "admin@prestamesta.com",
  "password": "AdminSuperSeguro123"
}
