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

Registro Cliente

Registro (POST http://localhost:3000/api/auth/register)

JSON
{
  "nombre": "Juan Pérez",
  "email": "juan@example.com",
  "password": "miPasswordSeguro123",
  "telefono": "8711234567"
}
Login (POST http://localhost:3000/api/auth/login)

JSON
{
  "email": "juan@example.com",
  "password": "miPasswordSeguro123"
}


Para mas ejemplos la documentacion de APis esta aqui:
https://docs.google.com/document/d/1JGsfgmaGnCulp4J1vSX1TzFVm0CMj9c3xheSS1GbKw8/edit?tab=t.0
