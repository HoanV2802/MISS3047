begin;
insert into public.employees(id,name,dept,role) values
('NV01','Nguyễn Văn An','Bếp','Part-time'),
('NV02','Trần Thị Bình','Bếp','Part-time'),
('NV03','Lê Hoàng Cường','Bếp','Part-time'),
('NV04','Phạm Thị Dung','Bếp','Part-time'),
('NV05','Hoàng Văn Em','Bếp','Part-time'),
('NV06','Vũ Thị Giang','Bếp','Part-time'),
('NV07','Đặng Hữu Hải','Phục vụ','Part-time'),
('NV08','Bùi Khánh Linh','Phục vụ','Part-time'),
('NV09','Ngô Đức Minh','Phục vụ','Part-time'),
('NV10','Đỗ Phương Thảo','Pha chế','Part-time'),
('NV11','Trịnh Quốc Huy','Pha chế','Part-time'),
('NV12','Mai Ánh Tuyết','Pha chế','Part-time'),
('NV13','Lâm Gia Bảo','Pha chế','Part-time'),
('NV14','Võ Quỳnh Như','Pha chế','Part-time'),
('NV15','Phan Minh Khang','Pha chế','Part-time'),
('NV16','Tạ Ngọc Hân','Pha chế','Part-time'),
('NV17','Châu Nhật Nam','Pha chế','Part-time'),
('NV18','Đoàn Yến Nhi','Pha chế','Part-time')
on conflict(id) do nothing;
commit;
